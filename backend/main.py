"""FastAPI backend for the Spooky AI Ghost Riddle Booth.

Endpoints:
  GET  /api/health        -> STT/LLM readiness for the operator screen
  GET  /api/riddles       -> riddle bank WITHOUT answers (choices + hint only)
  POST /api/answer/tap    -> grade a tapped multiple-choice answer
  WS   /ws/answer         -> grade a spoken answer (send riddle_id, then audio)

Design goals: start instantly, degrade gracefully, never block the booth.
"""
from __future__ import annotations

import json
import logging
import random
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import ai
from judge import grade, grade_tap
from stt import transcriber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("ghost.main")

RIDDLES_PATH = Path(__file__).with_name("riddles.json")
_RIDDLES: list[dict] = json.loads(RIDDLES_PATH.read_text())["riddles"]
_BY_ID: dict[str, dict] = {r["id"]: r for r in _RIDDLES}

# ---- AI extras (all optional; the booth works fine with Ollama off) ----
_REACTIONS: dict[str, list[str]] = {"win": [], "lose": [], "greet": []}
_REACTIONS_MAX = 24
_refresh_lock = threading.Lock()
_ai_counter = 0
_recent_ai_answers: list[str] = []


def _refresh_reactions() -> None:
    """Top up the cached Ollama-written ghost lines (runs in a thread)."""
    if not _refresh_lock.acquire(blocking=False):
        return
    try:
        for kind in ("win", "lose", "greet"):
            fresh = ai.make_reactions(kind)
            merged = list(dict.fromkeys(fresh + _REACTIONS[kind]))
            _REACTIONS[kind] = merged[:_REACTIONS_MAX]
    finally:
        _refresh_lock.release()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm the model and pre-write some reactions so the first cheer is instant.
    threading.Thread(target=_refresh_reactions, daemon=True).start()
    yield


app = FastAPI(title="Spooky AI Ghost Riddle Booth", lifespan=lifespan)

# The kiosk frontend is same-machine; keep CORS open for easy LAN testing too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _public_riddle(r: dict, level: str | None = None) -> dict:
    """Strip answers before sending to the browser.

    Little kids get just 2 choices (the right one plus one wrong one).
    """
    choices = list(r.get("choices", []))
    if level == "little" and len(choices) > 2:
        right = next((c for c in choices if grade_tap(r["answers"], c)["correct"]), choices[0])
        wrong = [c for c in choices if c != right]
        choices = [right, random.choice(wrong)]
    random.shuffle(choices)
    return {
        "id": r["id"],
        "question": r["question"],
        "choices": choices,
        "hint": r.get("hint", ""),
        "level": r.get("level", "big"),
    }


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "stt_available": transcriber.available,
        "riddles": len(_RIDDLES),
    }


@app.get("/api/riddles")
def riddles(level: str | None = None) -> dict:
    """Riddle bank; with ?level=little|big only that level (little = 2 choices)."""
    pool = [r for r in _RIDDLES if level not in ("little", "big") or r.get("level") == level]
    return {"riddles": [_public_riddle(r, level) for r in pool]}


@app.post("/api/riddles/generate")
def generate_riddle(level: str = "big") -> dict:
    """Have Ollama write a brand-new riddle. 503 if it can't (UI keeps going)."""
    global _ai_counter
    # Don't repeat answers already in the bank or recently generated.
    avoid = [a for r in _RIDDLES for a in r["answers"]] + _recent_ai_answers
    level = level if level in ("little", "big") else "big"
    made = ai.make_riddle(avoid, level)
    if made is None:
        raise HTTPException(status_code=503, detail="Could not conjure a riddle")
    _ai_counter += 1
    rid = f"ai{_ai_counter}"
    record = {
        "id": rid,
        "question": made["question"],
        "answers": [made["answer"].lower()],
        "choices": made["choices"],
        "hint": made["hint"],
        "level": level,
    }
    _BY_ID[rid] = record
    _recent_ai_answers.append(made["answer"].lower())
    del _recent_ai_answers[:-10]
    return {"riddle": {**_public_riddle(record, level), "ai": True}}


@app.get("/api/reactions")
def reactions() -> dict:
    """Cached Ollama-written ghost lines; also kicks off a background top-up."""
    threading.Thread(target=_refresh_reactions, daemon=True).start()
    return _REACTIONS


class TapAnswer(BaseModel):
    riddle_id: str
    choice: str


@app.post("/api/answer/tap")
def answer_tap(body: TapAnswer) -> dict:
    riddle = _BY_ID.get(body.riddle_id)
    if riddle is None:
        return {"correct": False, "method": "unknown-riddle", "transcript": ""}
    result = grade_tap(riddle["answers"], body.choice)
    result["transcript"] = body.choice
    return result


@app.websocket("/ws/answer")
async def ws_answer(ws: WebSocket) -> None:
    """Protocol: client sends a JSON text frame {"riddle_id": "..."},
    then one binary frame with the recorded audio (webm/opus or wav).
    Server replies with a JSON verdict and closes.
    """
    await ws.accept()
    try:
        meta = json.loads(await ws.receive_text())
        riddle = _BY_ID.get(meta.get("riddle_id", ""))
        if riddle is None:
            await ws.send_json({"error": "unknown riddle"})
            return

        audio = await ws.receive_bytes()
        log.info("Received %d bytes of audio for %s", len(audio), riddle["id"])

        transcript = transcriber.transcribe_media(audio)
        if not transcript:
            await ws.send_json(
                {
                    "correct": False,
                    "method": "no-speech",
                    "transcript": "",
                    "message": "I couldn't hear you, little one!",
                }
            )
            return

        result = grade(riddle["question"], riddle["answers"], transcript)
        result["transcript"] = transcript
        log.info("Verdict for %s: %s (%r)", riddle["id"], result["correct"], transcript)
        await ws.send_json(result)
    except WebSocketDisconnect:
        log.info("Client disconnected mid-answer.")
    except Exception as err:  # noqa: BLE001
        log.exception("WS error: %s", err)
        try:
            await ws.send_json({"error": str(err)})
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
