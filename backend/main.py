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
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from judge import grade, grade_tap
from stt import transcriber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("ghost.main")

RIDDLES_PATH = Path(__file__).with_name("riddles.json")
_RIDDLES: list[dict] = json.loads(RIDDLES_PATH.read_text())["riddles"]
_BY_ID: dict[str, dict] = {r["id"]: r for r in _RIDDLES}

app = FastAPI(title="Spooky AI Ghost Riddle Booth")

# The kiosk frontend is same-machine; keep CORS open for easy LAN testing too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _public_riddle(r: dict) -> dict:
    """Strip answers before sending to the browser."""
    choices = list(r.get("choices", []))
    random.shuffle(choices)
    return {
        "id": r["id"],
        "question": r["question"],
        "choices": choices,
        "hint": r.get("hint", ""),
    }


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "stt_available": transcriber.available,
        "riddles": len(_RIDDLES),
    }


@app.get("/api/riddles")
def riddles() -> dict:
    return {"riddles": [_public_riddle(r) for r in _RIDDLES]}


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
