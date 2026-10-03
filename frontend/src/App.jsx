import React, { useCallback, useEffect, useRef, useState } from "react";
import Ghost from "./Ghost.jsx";
import OperatorBar from "./OperatorBar.jsx";
import { speak, stopSpeaking } from "./voice.js";
import { PushToTalk, gradeSpokenAnswer, supportsRecording } from "./recorder.js";

// Game phases
const PHASE = {
  ATTRACT: "attract",
  ASKING: "asking",
  AWAITING: "awaiting",
  LISTENING: "listening",
  THINKING: "thinking",
  CORRECT: "correct",
  WRONG: "wrong",
};

const WIN_LINES = [
  "Trick or treat! Grab a treat, my friend!",
  "Boo-rilliant! You got it! Take a treat!",
  "Spooktacular! That's right! Grab a treat!",
];
const TRY_AGAIN_LINES = [
  "Ooooh, not quite! Give it another try!",
  "Hmmm, that's not it. Try again, brave one!",
  "So close! Have another guess!",
];

// Tap-only by default (reliable in a noisy room). Add ?voice=1 to the URL to
// also enable the hold-to-talk microphone button.
const VOICE_ENABLED = new URLSearchParams(window.location.search).get("voice") === "1";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function App() {
  const [riddles, setRiddles] = useState([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(PHASE.ATTRACT);
  const canRecord = VOICE_ENABLED && supportsRecording();
  const [showChoices, setShowChoices] = useState(!canRecord);
  const [wrongChoices, setWrongChoices] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("");
  const pttRef = useRef(null);

  const riddle = riddles[index];

  // Load the riddle bank once.
  useEffect(() => {
    fetch("/api/riddles")
      .then((r) => r.json())
      .then((d) => setRiddles(d.riddles || []))
      .catch(() => setStatus("Could not reach the ghost's brain (backend)."));
  }, []);

  const ghostMood =
    phase === PHASE.CORRECT
      ? "happy"
      : phase === PHASE.WRONG
      ? "sad"
      : phase === PHASE.ASKING
      ? "talking"
      : "idle";

  const askRiddle = useCallback(
    (r) => {
      if (!r) return;
      setShowChoices(!canRecord);
      setWrongChoices([]);
      setTranscript("");
      setPhase(PHASE.ASKING);
      speak(r.question, {
        onEnd: () => setPhase((p) => (p === PHASE.ASKING ? PHASE.AWAITING : p)),
      });
    },
    [canRecord]
  );

  // Start button: unlock audio + mic, then ask the first riddle.
  const handleStart = async () => {
    try {
      if (canRecord) {
        pttRef.current = new PushToTalk();
        await pttRef.current.prime();
      }
    } catch {
      setStatus("Microphone blocked — tap-to-answer still works!");
    }
    askRiddle(riddles[index]);
  };

  const nextRiddle = useCallback(() => {
    stopSpeaking();
    setIndex((i) => {
      const ni = (i + 1) % riddles.length;
      askRiddle(riddles[ni]);
      return ni;
    });
  }, [riddles, askRiddle]);

  const showResult = useCallback((correct) => {
    stopSpeaking();
    if (correct) {
      setPhase(PHASE.CORRECT);
      speak(pick(WIN_LINES));
    } else {
      setPhase(PHASE.WRONG);
      speak(pick(TRY_AGAIN_LINES), {
        // After the encourage line, let them try again on the same riddle.
        onEnd: () => setPhase((p) => (p === PHASE.WRONG ? PHASE.AWAITING : p)),
      });
    }
  }, []);

  // ---- Push-to-talk handlers ----
  const beginTalk = async () => {
    if (phase !== PHASE.AWAITING || !canRecord || !pttRef.current) return;
    stopSpeaking();
    try {
      pttRef.current.start();
      setPhase(PHASE.LISTENING);
    } catch {
      setStatus("Mic error — use tap-to-answer.");
    }
  };

  const endTalk = async () => {
    if (phase !== PHASE.LISTENING || !pttRef.current) return;
    setPhase(PHASE.THINKING);
    try {
      const blob = await pttRef.current.stop();
      const verdict = await gradeSpokenAnswer(riddle.id, blob);
      setTranscript(verdict.transcript || "");
      if (verdict.method === "no-speech") {
        setStatus("I couldn't hear you — hold the button and speak up!");
        setPhase(PHASE.AWAITING);
        return;
      }
      showResult(!!verdict.correct);
    } catch {
      setStatus("Hmm, my ears glitched. Try again or tap your answer.");
      setPhase(PHASE.AWAITING);
    }
  };

  // ---- Tap-to-answer ----
  const tapAnswer = async (choice) => {
    if (phase !== PHASE.AWAITING && phase !== PHASE.ASKING) return;
    stopSpeaking();
    setPhase(PHASE.THINKING);
    try {
      const r = await fetch("/api/answer/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riddle_id: riddle.id, choice }),
      });
      const verdict = await r.json();
      if (!verdict.correct) setWrongChoices((w) => [...w, choice]);
      showResult(!!verdict.correct);
    } catch {
      setStatus("Could not reach the ghost's brain.");
      setPhase(PHASE.AWAITING);
    }
  };

  // ---- Operator controls (hidden hotkeys) ----
  const repeat = useCallback(() => riddle && askRiddle(riddle), [riddle, askRiddle]);

  useEffect(() => {
    const onKey = (e) => {
      if (phase === PHASE.ATTRACT) return;
      switch (e.key.toLowerCase()) {
        case "c": // operator: mark correct
          showResult(true);
          break;
        case "x": // operator: mark wrong
          showResult(false);
          break;
        case "n": // next riddle
          nextRiddle();
          break;
        case "r": // repeat current riddle
          repeat();
          break;
        case "t": // toggle choices (voice mode only)
          if (canRecord) setShowChoices((s) => !s);
          break;
        case "h": // speak hint
          if (riddle?.hint) speak(riddle.hint);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, riddle, canRecord, showResult, nextRiddle, repeat]);

  // ---- Render ----
  if (phase === PHASE.ATTRACT) {
    return (
      <div className="stage attract">
        <div className="bats" aria-hidden="true">🦇🕸️🎃👻🕷️</div>
        <Ghost mood="idle" />
        <h1>Boo! I'm Gus the Ghost 👻</h1>
        <p className="subtitle">Answer my spooky riddles for a treat!</p>
        <button className="big-btn start" onClick={handleStart} disabled={!riddles.length}>
          {riddles.length ? "Start the Game!" : "Summoning the ghost..."}
        </button>
        {status && <p className="status">{status}</p>}
      </div>
    );
  }

  return (
    <div className={`stage phase-${phase}`}>
      <div className="bats" aria-hidden="true">🦇🕸️🎃👻🕷️</div>

      <Ghost mood={ghostMood} />

      <div className="riddle-card">
        {phase === PHASE.CORRECT ? (
          <h2 className="verdict win">🍬 Trick or Treat! Grab a treat! 🍬</h2>
        ) : phase === PHASE.WRONG ? (
          <h2 className="verdict lose">👻 Oooh… try again! 👻</h2>
        ) : (
          <p className="question">{riddle?.question}</p>
        )}
      </div>

      {/* Answer controls */}
      {(phase === PHASE.AWAITING || phase === PHASE.LISTENING || (phase === PHASE.ASKING && !canRecord)) && (
        <div className="controls">
          {canRecord && (
            <button
              className={`big-btn talk ${phase === PHASE.LISTENING ? "recording" : ""}`}
              onMouseDown={beginTalk}
              onMouseUp={endTalk}
              onMouseLeave={endTalk}
              onTouchStart={(e) => {
                e.preventDefault();
                beginTalk();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                endTalk();
              }}
            >
              {phase === PHASE.LISTENING ? "🎤 Listening… release when done" : "🎤 Hold to Answer"}
            </button>
          )}

          {canRecord && (
            <button className="link-btn" onClick={() => setShowChoices((s) => !s)}>
              {showChoices ? "Hide choices" : "Too shy? Tap your answer 👉"}
            </button>
          )}

          {showChoices && (
            <div className="choices">
              {(riddle?.choices || []).map((c) => (
                <button
                  key={c}
                  className="choice-btn"
                  disabled={wrongChoices.includes(c)}
                  onClick={() => tapAnswer(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === PHASE.THINKING && <p className="thinking">👻 The ghost is thinking…</p>}

      {phase === PHASE.CORRECT && (
        <button className="big-btn next" onClick={nextRiddle}>
          Next Riddle 🎃
        </button>
      )}

      {canRecord && transcript && phase !== PHASE.CORRECT && (
        <p className="heard">I heard: “{transcript}”</p>
      )}
      {status && <p className="status">{status}</p>}

      <OperatorBar
        onCorrect={() => showResult(true)}
        onWrong={() => showResult(false)}
        onNext={nextRiddle}
        onRepeat={repeat}
        onHint={() => riddle?.hint && speak(riddle.hint)}
        riddleNumber={index + 1}
        total={riddles.length}
      />
    </div>
  );
}
