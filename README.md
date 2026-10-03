# 👻 Spooky AI Ghost Riddle Booth

An AI-powered Halloween game for the **Innovation Lab** carnival table. *Gus the
Ghost* appears on your 43" screen, reads spooky riddles aloud, and kids **tap the
right answer** from big buttons. Get it right and Gus cheers
*"Trick or treat — grab a treat!"*; get it wrong and the button greys out so
they can try another.

Because carnivals are loud, **tap-only is the default**. Voice answers
(microphone → Whisper → Ollama) are still built in as an opt-in extra: open the
page with `?voice=1` (e.g. `http://localhost:5173/?voice=1`).

Everything runs **locally on your computer** — no cloud, no internet required at
the booth.

---

## 🧩 How it works

```
Mic → Whisper (speech→text) → Ollama (judge answer) → verdict
                                    ↘ RapidFuzz fast match (safety net)
Screen ← animated Ghost + spoken responses (browser voice)
         ↑ you, the operator, can override with ✓ / ✗ keys
```

| Piece       | Tech                    | Notes                                         |
|-------------|-------------------------|-----------------------------------------------|
| Backend     | Python + FastAPI        | WebSocket for audio, REST for riddles         |
| Speech→text | `faster-whisper` (GPU)  | Runs on your RTX 3060                          |
| Answer judge| Ollama `llama3.2:3b`    | Plus RapidFuzz fuzzy matching as a safety net |
| Frontend    | React + Vite            | Animated SVG ghost, kiosk-ready               |
| Ghost voice | Browser speech synthesis| Zero setup (Piper optional — see below)       |

The booth is designed to **never get stuck**: if the mic is noisy or a kid
mumbles, you have tap-to-answer *and* hidden operator keys.

---

## 🚀 Quick start

### 0. One-time prerequisites

- **Python 3.10+**, **Node 18+**, and **Ollama** (you already have all three).
- *Only for voice mode (`?voice=1`):* pull the judge model once (needs internet):
  ```bash
  ollama pull llama3.2:3b
  ```
  Tap-only mode needs neither Ollama nor Whisper.

### 1. Run it

```bash
./run.sh          # dev mode  → http://localhost:5173
./run.sh kiosk    # built/optimized → http://localhost:4173
```

The first run creates a Python virtual environment and installs everything
(this downloads the Whisper model too, ~150 MB — do it **before** carnival day
while you have good wifi). Later runs start instantly.

### 2. Open on the big screen

Open the URL in **Google Chrome**, then press **F11** for fullscreen. Click
**"Start the Game!"** (this also unlocks the microphone and the ghost's voice —
browsers require one click before audio can play).

---

## 🎮 Playing & operating

**For the kids:**
- Listen to Gus read the riddle, then **tap an answer** (you can tap while he's still talking).
- *(Voice mode, `?voice=1` only)* **Hold** the 🎤 "Hold to Answer" button and say the answer.

**For you (the operators)** — hidden controls, press **`** (backtick) or tap the
tiny dot in the bottom-right corner to reveal the bar. Keyboard shortcuts work
anytime:

| Key | Action |
|-----|--------|
| `C` | Mark the answer **Correct** (celebrate) |
| `X` | Mark the answer **Wrong** (try again) |
| `N` | **Next** riddle |
| `R` | **Repeat** / re-ask the current riddle |
| `H` | Speak the **hint** |
| `T` | Toggle the choices (voice mode only) |
| `` ` `` | Show/hide the operator bar |

> 💡 **The golden rule:** if a kid is stuck or frustrated, just press **C** to
> let them win. No child should walk away sad because of a glitch.

---

## 🛠️ Tuning (optional)

Set environment variables before `./run.sh` (or edit `backend/.venv` launch):

| Variable | Default | What it does |
|----------|---------|--------------|
| `WHISPER_MODEL` | `base.en` | `small.en` = more accurate but slower; `tiny.en` = fastest |
| `OLLAMA_MODEL` | `llama3.2:3b` | Any pulled Ollama model |
| `FUZZY_THRESHOLD` | `82` | Lower = more forgiving answer matching (0–100) |
| `WHISPER_DEVICE` | `cuda` | Set to `cpu` if you ever run without the GPU |

Riddles live in [`backend/riddles.json`](backend/riddles.json) — add your own!
Each has a `question`, a list of accepted `answers` (be generous), 3 `choices`,
and a `hint`.

---

## ✅ Carnival-day checklist

Run through this the morning of:

- [ ] `ollama serve` is running and `ollama list` shows `llama3.2:3b`.
- [ ] Speaker plugged in, volume up; mic plugged in and close to kid height.
- [ ] `./run.sh kiosk` started; page open in Chrome **fullscreen (F11)**.
- [ ] Clicked **Start** once (unlocks the ghost's voice).
- [ ] Play through one riddle: tap a wrong answer, then the right one.
- [ ] Confirm **C** and **X** keys work for operator override.
- [ ] Disable the monitor's sleep/screensaver.
- [ ] Have the candy bowl ready. 🍬

### If something goes wrong

| Problem | Fix |
|---------|-----|
| Ghost won't talk | Click anywhere / re-click **Start** — browsers block audio until a click. |
| Mic not working (voice mode) | Grant Chrome mic permission, or use the default tap mode. |
| Answers misjudged | Press **C**/**X** to override; lower `FUZZY_THRESHOLD`. |
| "Couldn't reach the ghost's brain" | Backend not running — check the `run.sh` terminal. |
| Slow responses | Use `WHISPER_MODEL=tiny.en` and keep `llama3.2:3b`. |

---

## 🔊 Optional upgrade: Piper voice

The ghost uses your browser's built-in voice by default (no setup). For a more
custom, consistent ghost voice you can pre-render clips with
[Piper](https://github.com/rhasspy/piper): generate a `.wav` per riddle/response
into `assets/audio/` and play those instead. Not required — the built-in voice
works great for a carnival.

---

## 📁 Project layout

```
halloween_game/
├── run.sh                 # one-command launcher (dev | kiosk)
├── backend/
│   ├── main.py            # FastAPI app: /api/riddles, /api/answer/tap, /ws/answer
│   ├── stt.py             # faster-whisper speech-to-text (graceful fallback)
│   ├── judge.py           # Ollama + RapidFuzz answer grading
│   ├── riddles.json       # the riddle bank (edit me!)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx        # game flow + phases
        ├── Ghost.jsx      # animated SVG ghost (idle/talking/happy/sad)
        ├── OperatorBar.jsx# hidden operator controls
        ├── voice.js       # ghost text-to-speech
        ├── recorder.js    # push-to-talk mic capture
        └── styles.css
```

Happy haunting! 🎃👻
