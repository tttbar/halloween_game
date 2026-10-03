"""Answer grading for the ghost riddle game.

Two layers, generous by design (we'd rather let a kid pass than frustrate them):

1. Fuzzy keyword match (RapidFuzz) -- instant, catches "a pumpkin", "pumpkin!",
   "umm a pumpkin i think", minor mishearings, etc.
2. Ollama LLM judge -- only consulted if fuzzy is inconclusive. Understands
   paraphrases ("the thing witches ride" == broom). Returns CORRECT/INCORRECT.

If Ollama is unavailable the fuzzy layer stands alone. The operator ✓/✗ keys in
the UI are the final human safety net regardless.
"""
from __future__ import annotations

import logging
import os
import re

log = logging.getLogger("ghost.judge")

OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
# RapidFuzz partial-ratio threshold (0-100). Lower = more generous.
FUZZY_THRESHOLD = int(os.environ.get("FUZZY_THRESHOLD", "82"))

_FILLER = {
    "a", "an", "the", "is", "it", "its", "it's", "um", "umm", "uh", "er",
    "like", "think", "i", "maybe", "answer", "that", "this", "my",
}


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [t for t in text.split() if t and t not in _FILLER]
    return " ".join(tokens)


def fuzzy_match(transcript: str, answers: list[str]) -> tuple[bool, float]:
    """Return (matched, best_score). Pure-python fallback if RapidFuzz absent."""
    norm = _normalize(transcript)
    if not norm:
        return False, 0.0

    try:
        from rapidfuzz import fuzz

        best = 0.0
        for ans in answers:
            a = _normalize(ans)
            if not a:
                continue
            # partial_ratio handles the answer appearing inside a longer phrase.
            score = max(fuzz.partial_ratio(a, norm), fuzz.token_set_ratio(a, norm))
            best = max(best, score)
        return best >= FUZZY_THRESHOLD, best
    except Exception:  # noqa: BLE001 - no rapidfuzz: substring fallback
        for ans in answers:
            a = _normalize(ans)
            if a and a in norm:
                return True, 100.0
        return False, 0.0


def ollama_judge(question: str, answers: list[str], transcript: str) -> bool | None:
    """Ask the local LLM whether the transcript answers the riddle.

    Returns True/False, or None if Ollama is unreachable / errored.
    """
    prompt = (
        "You are judging a children's Halloween riddle game. Be generous: accept "
        "answers that mean the right thing even if spelled or phrased differently.\n\n"
        f"Riddle: {question}\n"
        f"Accepted answers: {', '.join(answers)}\n"
        f"The child said: \"{transcript}\"\n\n"
        "Did the child give a correct answer? Reply with exactly one word: "
        "CORRECT or INCORRECT."
    )
    try:
        import json
        import urllib.request

        payload = json.dumps(
            {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0, "num_predict": 4},
            }
        ).encode()
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode())
        answer = (body.get("response") or "").strip().upper()
        log.info("Ollama verdict: %r", answer)
        if "CORRECT" in answer and "INCORRECT" not in answer:
            return True
        if "INCORRECT" in answer:
            return False
        return None
    except Exception as err:  # noqa: BLE001
        log.warning("Ollama judge unavailable (%s).", err)
        return None


def grade(question: str, answers: list[str], transcript: str) -> dict:
    """Grade a spoken answer. Returns a verdict dict for the frontend."""
    if not transcript.strip():
        return {"correct": False, "method": "empty", "score": 0.0}

    matched, score = fuzzy_match(transcript, answers)
    if matched:
        return {"correct": True, "method": "fuzzy", "score": score}

    # Inconclusive fuzzy -> consult the LLM if the score is in the gray zone
    # or simply failed. A clearly-wrong, low-score answer still gets one LLM
    # chance because kids paraphrase a lot.
    verdict = ollama_judge(question, answers, transcript)
    if verdict is True:
        return {"correct": True, "method": "ollama", "score": score}
    if verdict is False:
        return {"correct": False, "method": "ollama", "score": score}

    # Ollama unavailable: fall back to the fuzzy result.
    return {"correct": matched, "method": "fuzzy-only", "score": score}
