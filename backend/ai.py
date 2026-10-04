"""Ollama-powered extras: fresh riddles and varied ghost reactions.

Everything here is optional. Every function returns None/[] when Ollama is
unreachable or produces something unusable, and callers fall back to the
built-in riddle bank and canned lines.
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
import urllib.request

log = logging.getLogger("ghost.ai")

# Riddle writing needs a bit more brains than yes/no judging, so it defaults to
# the 8B model (~1-3s per riddle on an RTX 3060).
OLLAMA_MODEL = os.environ.get("OLLAMA_WRITER_MODEL", "llama3.1:8b")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# Curated answer pool. The CODE picks the answer and the wrong choices (from
# other categories so they can't be confused); the model only writes the riddle.
WORD_POOL: dict[str, list[str]] = {
    "animal": ["bat", "spider", "owl", "black cat", "frog", "crow", "snake"],
    "creature": ["ghost", "witch", "skeleton", "mummy", "vampire", "dragon", "scarecrow"],
    "food": ["candy corn", "caramel apple", "cupcake", "popcorn", "lollipop", "cookie"],
    "thing": ["broom", "candle", "cauldron", "mask", "flashlight", "treat bag", "spider web"],
    "nature": ["moon", "star", "pumpkin", "autumn leaf", "tree", "cloud"],
}

# Anything in a generated riddle matching this is rejected (kid-safe filter).
_BLOCKED = re.compile(
    r"\b(blood|bloody|kill|killed|die|dead|death|murder|gun|knife|weapon|"
    r"stab|gore|hell|devil|demon|corpse|suicide|drug|beer|wine|sex)\b",
    re.I,
)


def _generate(prompt: str, *, json_mode: bool, temperature: float, num_predict: int,
              timeout: float) -> str | None:
    body: dict = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "30m",
        "options": {"temperature": temperature, "num_predict": num_predict},
    }
    if json_mode:
        body["format"] = "json"
    try:
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/generate",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return (json.loads(resp.read().decode()).get("response") or "").strip()
    except Exception as err:  # noqa: BLE001
        log.warning("Ollama unavailable (%s).", err)
        return None


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text).replace("\\n", " ")).strip()


def _make_riddle_once(avoid: list[str] | None = None) -> dict | None:
    """Pick an answer + distractors from the pool; ask Ollama to write the riddle.

    Returns {question, answer, choices[3], hint} or None if generation failed
    validation (callers then fall back to the built-in riddles).
    """
    avoid_l = {a.lower() for a in (avoid or [])}
    cats = list(WORD_POOL)
    cat = random.choice(cats)
    options = [w for w in WORD_POOL[cat] if w not in avoid_l] or WORD_POOL[cat]
    answer = random.choice(options)
    other = [c for c in cats if c != cat]
    wrong = [random.choice(WORD_POOL[c]) for c in random.sample(other, 2)]

    prompt = (
        "You write riddles for kids aged 4 to 8 at a friendly Halloween carnival. "
        f"Write ONE short rhyming riddle (2 lines) whose answer is: {answer}. "
        "Describe real, true things about it using simple words. It must clearly be "
        f"{answer} and nothing else. Never say the word \"{answer}\" in the riddle. "
        "Keep it silly and fun, never scary, gory, or violent.\n"
        "Reply as JSON with exactly these keys: "
        '"question" (the riddle, ending with "What am I?") and '
        '"hint" (one very easy short hint that does not say the answer).'
    )
    raw = _generate(prompt, json_mode=True, temperature=0.8, num_predict=160, timeout=40)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        question = _clean(data["question"])
        hint = _clean(data.get("hint", ""))
    except Exception as err:  # noqa: BLE001
        log.warning("Bad riddle JSON (%s): %r", err, raw[:200])
        return None

    # Reject anything shaky rather than show a kid a broken riddle.
    if not question.endswith("?"):
        # The model often forgets the closing line; add it rather than discard.
        question = re.sub(r"[\s.!,;:]+$", "", question) + ". What am I?"
    if not (15 <= len(question) <= 220):
        log.info("Rejected riddle (length) for %r: %r", answer, question)
        return None
    answer_words = [w for w in answer.lower().split() if len(w) > 2]
    def mentions(text: str) -> bool:
        # Whole words (plus plurals) so "cat" doesn't match "catch".
        return any(re.search(rf"\b{re.escape(w)}(s|es)?\b", text.lower()) for w in answer_words)

    if mentions(question):
        log.info("Rejected riddle (gave away %r): %r", answer, question)
        return None
    if mentions(hint):
        hint = ""
    if _BLOCKED.search(f"{question} {hint}"):
        log.info("Rejected riddle (blocked word) for %r: %r", answer, question)
        return None

    return {
        "question": question,
        "answer": answer.title(),
        "choices": [answer.title(), *(w.title() for w in wrong)],
        "hint": hint,
    }


def make_riddle(avoid: list[str] | None = None, attempts: int = 4) -> dict | None:
    """Retry generation a few times; validation rejects a fair share of tries."""
    for _ in range(attempts):
        riddle = _make_riddle_once(avoid)
        if riddle:
            return riddle
    return None


def make_reactions(kind: str, n: int = 6) -> list[str]:
    """Ask Ollama for varied ghost lines. kind is 'win' or 'lose'."""
    if kind == "win":
        brief = (
            "a kid just answered a riddle CORRECTLY. Each line must be excited, "
            "under 14 words, and must tell the child to grab a treat (use the word "
            '"treat"). Example: "Boo-tiful! You got it! Grab a treat!"'
        )
    else:
        brief = (
            "a kid just answered a riddle WRONG. Each line must be gentle and "
            "encouraging, under 12 words, and tell them to try another answer. "
            'Example: "Ooooh, not quite! Give it another try!"'
        )
    prompt = (
        "You are Gus, a silly, friendly, never-scary ghost at a kids' Halloween "
        f"carnival. Write {n} different short things Gus could say when {brief} "
        'Reply as JSON: {"lines": ["...", "..."]}'
    )
    raw = _generate(prompt, json_mode=True, temperature=1.0, num_predict=300, timeout=30)
    if not raw:
        return []
    try:
        lines = [_clean(x) for x in json.loads(raw)["lines"]]
    except Exception as err:  # noqa: BLE001
        log.warning("Bad reactions JSON (%s)", err)
        return []

    good = []
    for line in lines:
        if not (4 <= len(line) <= 110) or _BLOCKED.search(line):
            continue
        if kind == "win" and "treat" not in line.lower():
            continue
        good.append(line)
    return good
