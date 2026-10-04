import React, { useCallback, useEffect, useRef, useState } from "react";
import Ghost from "./Ghost.jsx";
import HowItWorks from "./HowItWorks.jsx";
import OperatorBar from "./OperatorBar.jsx";
import { speak, stopSpeaking } from "./voice.js";
import { PushToTalk, gradeSpokenAnswer, supportsRecording } from "./recorder.js";
import { usePresence } from "./usePresence.js";

// Game phases
const PHASE = {
  ATTRACT: "attract",
  LEVEL: "level",
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
const GREET_LINES = [
  "Boo! Hello there! Want to play a spooky riddle game?",
  "Oooooh, a visitor! Come play riddles with me!",
  "Hi, friend! Press Start and let's play!",
];

const params = new URLSearchParams(window.location.search);
// Tap-only by default (reliable in a noisy room). ?voice=1 adds hold-to-talk.
const VOICE_ENABLED = params.get("voice") === "1";
// Camera greeting is on by default; ?camera=0 turns it off. ?near=0.15 changes
// how close someone must stand (bigger = closer).
const CAMERA_DEFAULT = params.get("camera") !== "0";
const NEAR_SIZE = Number(params.get("near")) || 0.12;

// The "barker": in attract mode Gus calls out an invitation every so often.
// ?bark=0 turns it off; the operator can also toggle it with M.
const BARK_DEFAULT = params.get("bark") !== "0";
const BARK_EVERY_MS = 45000;

const GREET_COOLDOWN_MS = 30000;
const WALK_AWAY_MS = 60000;

// Ollama-written lines (fetched from the backend) are mixed in with the
// built-in ones above, which are the fallback when Ollama is off.
const aiLines = { win: [], lose: [], greet: [] };

function refreshAiLines() {
  fetch("/api/reactions")
    .then((r) => r.json())
    .then((d) => {
      aiLines.win = d.win || [];
      aiLines.lose = d.lose || [];
      aiLines.greet = d.greet || [];
    })
    .catch(() => {});
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [level, setLevel] = useState(null); // "little" | "big"
  const [riddles, setRiddles] = useState([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(PHASE.ATTRACT);
  const canRecord = VOICE_ENABLED && supportsRecording();
  const [showChoices, setShowChoices] = useState(!canRecord);
  const [wrongChoices, setWrongChoices] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("");
  const [thinkingMsg, setThinkingMsg] = useState("The ghost is thinking…");
  const [greeting, setGreeting] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [cameraOn, setCameraOn] = useState(CAMERA_DEFAULT);
  const [barkOn, setBarkOn] = useState(BARK_DEFAULT);
  const pttRef = useRef(null);
  const unlockedRef = useRef(false);
  const lastGreetRef = useRef(-Infinity);
  const lastActivityRef = useRef(Date.now());
  const sawFaceRef = useRef(false);

  const presence = usePresence(cameraOn, NEAR_SIZE);
  const riddle = riddles[index];

  // Backend reachability + first batch of AI lines.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(() => setReady(true))
      .catch(() => setStatus("Could not reach the ghost's brain (backend)."));
    refreshAiLines();
  }, []);

  const say = useCallback((text, opts) => {
    // Browsers only allow speech after the page has had one click/keypress.
    if (unlockedRef.current) speak(text, opts);
    else opts?.onEnd?.();
  }, []);

  const resetToAttract = useCallback(() => {
    stopSpeaking();
    setPhase(PHASE.ATTRACT);
    setLevel(null);
    setRiddles([]);
    setIndex(0);
    setStatus("");
    setGreeting("");
    sawFaceRef.current = false;
  }, []);

  const ghostMood =
    phase === PHASE.CORRECT
      ? "happy"
      : phase === PHASE.WRONG
      ? "sad"
      : phase === PHASE.ASKING || (phase === PHASE.ATTRACT && greeting)
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

  // Start: unlock mic (voice mode), then ask which level to play.
  const handleStart = useCallback(async () => {
    setGreeting("");
    stopSpeaking();
    try {
      if (canRecord) {
        pttRef.current = new PushToTalk();
        await pttRef.current.prime();
      }
    } catch {
      setStatus("Microphone blocked — tap-to-answer still works!");
    }
    setPhase(PHASE.LEVEL);
    speak("Are you a little ghost, or a big ghost?");
  }, [canRecord]);

  const chooseLevel = useCallback(
    async (lv) => {
      stopSpeaking();
      setStatus("");
      try {
        const res = await fetch(`/api/riddles?level=${lv}`);
        const { riddles: list } = await res.json();
        if (!list?.length) throw new Error("empty");
        const playlist = shuffled(list);
        setLevel(lv);
        setRiddles(playlist);
        setIndex(0);
        askRiddle(playlist[0]);
      } catch {
        setStatus("Could not reach the ghost's brain (backend).");
      }
    },
    [askRiddle]
  );

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
    refreshAiLines();
    if (correct) {
      setPhase(PHASE.CORRECT);
      speak(pick([...aiLines.win, ...WIN_LINES]));
    } else {
      setPhase(PHASE.WRONG);
      speak(pick([...aiLines.lose, ...TRY_AGAIN_LINES]), {
        // After the encourage line, let them try again on the same riddle.
        onEnd: () => setPhase((p) => (p === PHASE.WRONG ? PHASE.AWAITING : p)),
      });
    }
  }, []);

  // Operator: have Ollama write a brand-new riddle and jump straight to it.
  const conjureRiddle = useCallback(async () => {
    if (!level) return;
    stopSpeaking();
    setStatus("");
    setThinkingMsg("✨ Gus is conjuring a brand-new riddle…");
    setPhase(PHASE.THINKING);
    const url = `/api/riddles/generate?level=${level}`;
    try {
      let res = await fetch(url, { method: "POST" });
      if (!res.ok) res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("no riddle");
      const { riddle: made } = await res.json();
      setRiddles((rs) => [...rs.slice(0, index + 1), made, ...rs.slice(index + 1)]);
      setIndex(index + 1);
      askRiddle(made);
    } catch {
      setStatus("Gus couldn't think of a new riddle — carrying on with this one.");
      setPhase(PHASE.AWAITING);
    } finally {
      setThinkingMsg("The ghost is thinking…");
    }
  }, [index, level, askRiddle]);

  // ---- Push-to-talk handlers (voice mode) ----
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

  // ---- Tap / button answer ----
  const tapAnswer = async (choice) => {
    if (phase !== PHASE.AWAITING && phase !== PHASE.ASKING) return;
    if (wrongChoices.includes(choice)) return;
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

  const toggleLevel = useCallback(() => {
    if (level) chooseLevel(level === "little" ? "big" : "little");
  }, [level, chooseLevel]);

  const repeat = useCallback(() => riddle && askRiddle(riddle), [riddle, askRiddle]);

  // ---- Greetings: camera, operator wave (W), and the timed barker ----
  const greet = useCallback(() => {
    lastGreetRef.current = Date.now();
    const line = pick([...aiLines.greet, ...GREET_LINES]);
    setGreeting(line);
    const clear = () => setGreeting((g) => (g === line ? "" : g));
    say(line, { onEnd: () => setTimeout(clear, 5000) });
  }, [say]);

  // Someone walked up (camera).
  useEffect(() => {
    if (!presence.near || phase !== PHASE.ATTRACT) return;
    if (Date.now() - lastGreetRef.current < GREET_COOLDOWN_MS) return;
    greet();
  }, [presence.near, phase, greet]);

  // Timed barker: only when nobody is interacting and Gus hasn't just spoken.
  useEffect(() => {
    if (!barkOn || phase !== PHASE.ATTRACT) return undefined;
    const t = setInterval(() => {
      const now = Date.now();
      const quiet = now - lastGreetRef.current >= BARK_EVERY_MS;
      const untouched = now - lastActivityRef.current >= 15000;
      if (unlockedRef.current && quiet && untouched) greet();
    }, 5000);
    return () => clearInterval(t);
  }, [barkOn, phase, greet]);

  // Eyes/greeting only make sense while someone is in view.
  useEffect(() => {
    if (presence.seen) sawFaceRef.current = true;
  }, [presence.seen]);

  // Everyone walked away mid-game -> back to the attract screen.
  useEffect(() => {
    if (phase === PHASE.ATTRACT || presence.status !== "ready") return undefined;
    const t = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current > WALK_AWAY_MS;
      if (sawFaceRef.current && !presence.seen && idle) resetToAttract();
    }, 5000);
    return () => clearInterval(t);
  }, [phase, presence.status, presence.seen, resetToAttract]);

  // ---- Keyboard: operator hotkeys + number keys for physical buttons ----
  const onKeyRef = useRef(null);
  onKeyRef.current = (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const digit = /^[1-9]$/.test(key) ? Number(key) : 0;

    if (phase === PHASE.ATTRACT) {
      if ((digit === 1 || key === "enter") && ready) {
        e.preventDefault();
        handleStart();
      } else if (key === "w") {
        greet(); // operator waves Gus at someone approaching
      } else if (key === "v") {
        setCameraOn((c) => !c);
      } else if (key === "m") {
        setBarkOn((b) => !b);
      }
      return;
    }

    if (key === "escape") {
      resetToAttract();
      return;
    }
    if (phase === PHASE.LEVEL) {
      if (digit === 1) chooseLevel("little");
      else if (digit === 2) chooseLevel("big");
      return;
    }
    if (digit && (phase === PHASE.AWAITING || phase === PHASE.ASKING) && showChoices) {
      const choice = riddle?.choices?.[digit - 1];
      if (choice) {
        e.preventDefault();
        tapAnswer(choice);
      }
      return;
    }
    if ((digit === 1 || key === "enter") && phase === PHASE.CORRECT) {
      e.preventDefault();
      nextRiddle();
      return;
    }

    switch (key) {
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
      case "g": // generate a new riddle with AI
        conjureRiddle();
        break;
      case "l": // switch little/big
        toggleLevel();
        break;
      case "v": // camera on/off
        setCameraOn((c) => !c);
        break;
      case "m": // timed barker on/off
        setBarkOn((b) => !b);
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
  useEffect(() => {
    const onKey = (e) => onKeyRef.current(e);
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      if (!unlockedRef.current) {
        unlockedRef.current = true;
        setUnlocked(true);
      }
    };
    // onActivity first, so the key that unlocks speech can already use it.
    window.addEventListener("keydown", onActivity);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onActivity);
    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onActivity);
    };
  }, []);

  // ---- Render ----
  const operatorProps = {
      onCorrect: () => showResult(true),
      onWrong: () => showResult(false),
      onNext: nextRiddle,
      onRepeat: repeat,
      onConjure: conjureRiddle,
      onToggleCamera: () => setCameraOn((c) => !c),
      onToggleBark: () => setBarkOn((b) => !b),
      onWave: greet,
      onHome: resetToAttract,
      bark: barkOn,
      attract: phase === PHASE.ATTRACT,
      onToggleLevel: toggleLevel,
      onHint: () => riddle?.hint && speak(riddle.hint),
      riddleNumber: index + 1,
      total: riddles.length,
      level,
      camera: {
        on: cameraOn,
        status: presence.status,
        near: presence.near,
        seen: presence.seen,
        faceSize: presence.faceSize,
      },
    };

  const corner = (
    <>
      {presence.status === "ready" && <div className="cam-dot">📷</div>}
      {!unlocked && phase === PHASE.ATTRACT && (
        <div className="voice-hint">🔇 click once (or press any key) to turn on Gus's voice</div>
      )}
    </>
  );

  if (phase === PHASE.ATTRACT) {
    return (
      <div className="stage attract">
        <div className="bats" aria-hidden="true">🦇🕸️🎃👻🕷️</div>
        <Ghost mood={ghostMood} />
        <h1>Boo! I'm Gus the Ghost 👻</h1>
        {greeting ? (
          <p className="greeting">{greeting}</p>
        ) : (
          <p className="subtitle">Answer my spooky riddles for a treat!</p>
        )}
        <button className="big-btn start" onClick={handleStart} disabled={!ready}>
          {ready ? "Start the Game!" : "Summoning the ghost..."}
        </button>
        {status && <p className="status">{status}</p>}
        <HowItWorks cameraOn={presence.status === "ready"} />
        {corner}
        <OperatorBar {...operatorProps} />
      </div>
    );
  }

  if (phase === PHASE.LEVEL) {
    return (
      <div className="stage">
        <div className="bats" aria-hidden="true">🦇🕸️🎃👻🕷️</div>
        <Ghost mood="talking" />
        <div className="riddle-card">
          <p className="question">Are you a little ghost, or a big ghost?</p>
        </div>
        <div className="level-buttons">
          <button className="level-btn little" onClick={() => chooseLevel("little")}>
            🐣 I'm Little
            <small>(press 1)</small>
          </button>
          <button className="level-btn big" onClick={() => chooseLevel("big")}>
            🧒 I'm Big
            <small>(press 2)</small>
          </button>
        </div>
        {status && <p className="status">{status}</p>}
        {corner}
        <OperatorBar {...operatorProps} />
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
          <>
            {riddle?.ai && <p className="ai-badge">✨ Brand-new riddle, written by AI just now! ✨</p>}
            <p className="question">{riddle?.question}</p>
          </>
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
              {(riddle?.choices || []).map((c, i) => (
                <button
                  key={c}
                  className={`choice-btn choice-btn--${i}`}
                  disabled={wrongChoices.includes(c)}
                  onClick={() => tapAnswer(c)}
                >
                  <span className="num">{i + 1}</span>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === PHASE.THINKING && <p className="thinking">👻 {thinkingMsg}</p>}

      {phase === PHASE.CORRECT && (
        <button className="big-btn next" onClick={nextRiddle}>
          Next Riddle 🎃
        </button>
      )}

      {canRecord && transcript && phase !== PHASE.CORRECT && (
        <p className="heard">I heard: “{transcript}”</p>
      )}
      {status && <p className="status">{status}</p>}

      {corner}
      <OperatorBar {...operatorProps} />
    </div>
  );

}
