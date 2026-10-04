# 👻 Spooky AI Ghost Riddle Booth

An AI-powered Halloween game for the **Innovation Lab** carnival table. *Gus the
Ghost* appears on your 43" screen, reads spooky riddles aloud, and kids **tap the
right answer** from big buttons. Get it right and Gus cheers
*"Trick or treat — grab a treat!"*; get it wrong and the button greys out so
they can try another.

Because carnivals are loud, **tap-only is the default**. Voice answers
(microphone → Whisper → Ollama) are still built in as an opt-in extra: open the
page with `?voice=1` (e.g. `http://localhost:5173/?voice=1`).

## ✨ The AI part (Ollama)

Two optional features use your local Ollama. If Ollama is off, the game quietly
falls back to the built-in riddles and lines — nothing breaks.

1. **AI-written riddles** — press **`G`** (or ✨ in the operator bar) and Gus
   conjures a brand-new riddle in 1–5 seconds, marked *"Brand-new riddle,
   written by AI just now!"*. The code picks the answer and the two wrong
   choices from a curated word list (so choices are never confusing or unsafe);
   the model only writes the riddle, and bad/unsafe/answer-revealing riddles
   are rejected automatically. If a riddle is odd, press `N` to skip it.
2. **Varied ghost reactions** — Gus's cheers and "try again" lines are
   written by the model ahead of time (so there's no delay) and mixed in with
   the built-in lines. Cheers always say "treat" so kids know to grab candy.

One-time setup (while you have internet):
```bash
ollama pull llama3.1:8b
```
Tip: run `ollama serve` before the carnival; the model stays loaded for 30 minutes.

---

## 🎚️ Age levels

After **Start**, Gus asks *"Are you a little ghost, or a big ghost?"*
- **Little** (ages ~4–6): simpler riddles and just **2 answer choices**.
- **Big** (ages ~7–10): trickier riddles and **3 choices**.

AI riddles (`G`) follow the current level. Operators can switch with **`L`**.

## 🔘 Physical buttons / keyboard

Everything works with number keys, so a keyboard or USB arcade buttons work if
your screen isn't touch. Answer choices show numbered, color-coded badges
(1 orange, 2 purple, 3 green). Arcade-button encoders just send keys `1`/`2`/`3`.
`1` (or Enter) also presses **Start** and **Next Riddle**; on the level screen
`1` = Little, `2` = Big. `Esc` returns to the attract screen.

## 🔒 Privacy

There is **no camera or microphone use by default**. Gus never records or sends
anything anywhere; riddles are graded on your own computer. (Voice answers are
an opt-in extra with `?voice=1`; it records only while the button is held.) An earlier version had an optional webcam greeting; it was removed
to keep the project simple and is available at the git tag `camera-greeting`.

## 📣 Greeting visitors

On the welcome screen Gus also **calls out an invitation by himself** about
every 45 seconds ("Psst! Want to play a riddle?"), using the AI-written
greeting lines. He stays quiet while someone is touching the controls. Press
**`M`** to mute/unmute him (or start with `?bark=0`). When a visitor wanders up,
press **`W`** and Gus greets them right away.

---

Everything runs **locally on your computer** — no cloud, no internet required at
the booth.

---

## 🧩 How it works

```
Default:  Tap a button → backend exact-match check → verdict
Optional: Mic → Whisper → RapidFuzz / Ollama judge → verdict   (?voice=1)
Screen ← animated Ghost + spoken responses (browser voice)
         ↑ you, the operator, can override with ✓ / ✗ keys
```

| Piece       | Tech                    | Notes                                         |
|-------------|-------------------------|-----------------------------------------------|
| Backend     | Python + FastAPI        | REST for riddles + tap answers                |
| Speech→text | `faster-whisper` (GPU)  | Voice mode only                               |
| Answer judge| Ollama `llama3.2:3b`    | Voice mode only (plus RapidFuzz matching)     |
| Frontend    | React + Vite            | Animated SVG ghost, kiosk-ready               |
| Ghost voice | Browser speech synthesis| Zero setup (Piper optional — see below)       |

The booth is designed to **never get stuck**: answers are tapped (no noisy-room
guesswork) and you have hidden operator keys as a backup.

---

## 🚀 Quick start

### 0. One-time prerequisites

- **Python 3.10+** and **Node 18+**.
- Nothing else is *required*. Ollama (`ollama pull llama3.1:8b`) is only needed for the AI riddle / reaction features above; Whisper is only for voice mode.
- *Only if you want voice mode (`?voice=1`):*
  ```bash
  backend/.venv/bin/pip install -r backend/requirements-voice.txt
  ollama pull llama3.2:3b
  ```

### 1. Run it

```bash
./run.sh          # dev mode  → http://localhost:5173
./run.sh kiosk    # built/optimized → http://localhost:4173
```

The first run creates a Python virtual environment and installs the (small)
dependencies — do it **before** carnival day while you have wifi. Later runs
start instantly and work fully offline.

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
| `G` | Have **AI write a brand-new riddle** and jump to it |
| `L` | Switch **little/big** level |
| `Esc` | **Back to the welcome screen** (or use 🏠 in the operator bar) — do this after each kid |
| `W` | **Wave**: Gus greets whoever is walking up (welcome screen) |
| `M` | Timed "barker" on/off |
| `T` | Toggle the choices (voice mode only) |
| `` ` `` | Show/hide the operator bar |

> 💡 **The golden rule:** if a kid is stuck or frustrated, just press **C** to
> let them win. No child should walk away sad because of a glitch.

---

## 🛠️ Tuning (optional)

Set environment variables before `./run.sh`. All but the first row only matter in voice mode (`?voice=1`):

| Variable | Default | What it does |
|----------|---------|--------------|
| `OLLAMA_WRITER_MODEL` | `llama3.1:8b` | Model that writes riddles + reactions (not voice-only) |
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
| First word of Gus's lines cut off | The speakers/monitor audio fall asleep when idle. A soft chime now plays before a line after a quiet spell to wake them (add `?chime=0` to the URL to turn it off). Also try disabling power-saving/auto-standby on the monitor's audio. |
| Ghost won't talk | Click anywhere / re-click **Start** — browsers block audio until a click. |
| `G` says "couldn't think of a new riddle" | Ollama not running or model not pulled (`ollama list`). The game carries on with built-in riddles. |
| Mic not working (voice mode) | Grant Chrome mic permission, or use the default tap mode. |
| Answers misjudged | Press **C**/**X** to override; lower `FUZZY_THRESHOLD`. |
| "Couldn't reach the ghost's brain" | Backend not running — check the `run.sh` terminal. |

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
│   ├── stt.py             # voice mode: faster-whisper speech-to-text
│   ├── ai.py              # Ollama: AI-written riddles + ghost reactions
│   ├── judge.py           # tap grading (exact) + voice grading (RapidFuzz/Ollama)
│   ├── riddles.json       # the riddle bank (edit me!)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx        # game flow + phases
        ├── Ghost.jsx      # animated SVG ghost (idle/talking/happy/sad)
        ├── OperatorBar.jsx# hidden operator controls
        ├── HowItWorks.jsx # rotating Innovation Lab messages on the attract screen
        ├── voice.js       # ghost text-to-speech
        ├── recorder.js    # push-to-talk mic capture
        └── styles.css
```

Happy haunting! 🎃👻
