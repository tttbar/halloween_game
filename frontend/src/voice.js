// Ghostly text-to-speech using the browser's built-in SpeechSynthesis.
// No model download, instant, works offline. (Piper is an optional upgrade
// documented in the README for a more custom voice.)

let cachedVoice = null;

function pickVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  // Prefer an English voice; a slightly deeper one reads as "spooky".
  cachedVoice =
    voices.find((v) => /en[-_]?US/i.test(v.lang) && /male|daniel|fred/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null;
  return cachedVoice;
}

// Voices can load asynchronously.
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

// ---- "Is Gus speaking right now?" store (drives the mouth animation) ----
let speaking = false;
let currentId = 0; // lets a stale utterance's events be ignored
const listeners = new Set();

function setSpeaking(value) {
  if (speaking === value) return;
  speaking = value;
  listeners.forEach((fn) => fn());
}

export function subscribeSpeaking(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isSpeaking() {
  return speaking;
}

// ---- Keeping the first word from being clipped ----
// 1) Monitor/HDMI/Bluetooth audio sleeps when idle and swallows the start of
//    the next sound, so after a quiet spell a soft chime plays first to wake it.
// 2) Chrome can drop the start of a line spoken right after cancel(), so we
//    leave a short gap after any cancel.
// Turn the chime off with ?chime=0.
const CHIME_ENABLED =
  new URLSearchParams(typeof window !== "undefined" ? window.location?.search ?? "" : "").get(
    "chime"
  ) !== "0";
const CHIME_IDLE_MS = 3000;
const CANCEL_SETTLE_MS = 150;
let audioCtx = null;
let lastCancelAt = -Infinity;
let lastAudioAt = -Infinity;

// Plays two quick rising notes; returns how long (ms) to wait before speaking.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime + 0.02;
    [
      [660, 0],
      [880, 0.13],
    ].forEach(([freq, offset]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.07, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.22);
    });
    return 380;
  } catch {
    return 0;
  }
}

export function speak(text, { onEnd } = {}) {
  const synth = window.speechSynthesis;
  if (!synth) {
    onEnd?.();
    return;
  }
  const id = ++currentId;
  const now = performance.now();

  if (synth.speaking || synth.pending) {
    synth.cancel();
    lastCancelAt = now;
  }
  let delay = Math.max(0, CANCEL_SETTLE_MS - (now - lastCancelAt));
  if (CHIME_ENABLED && now - lastAudioAt > CHIME_IDLE_MS) {
    const chimeMs = playChime();
    if (chimeMs) lastAudioAt = now;
    delay = Math.max(delay, chimeMs);
  }

  let started = false;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    clearTimeout(startFallback);
    lastAudioAt = performance.now();
    if (id === currentId) setSpeaking(false);
    onEnd?.();
  };
  const begin = () => {
    if (started || finished || id !== currentId) return;
    started = true;
    lastAudioAt = performance.now();
    setSpeaking(true);
  };

  // Some engines never fire "end"; this guarantees the mouth stops and the game
  // can't stall. It's an upper bound only (~85ms per character at our rate).
  const watchdog = setTimeout(finish, delay + 1500 + text.length * 85);
  // Some engines never fire "start"; move the mouth anyway if audio is late.
  const startFallback = setTimeout(begin, delay + 700);

  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 0.9; // slower = clearer for kids
  u.pitch = 0.8; // lower = ghostly
  u.volume = 1;
  u.onstart = begin;
  u.onend = finish;
  u.onerror = finish;

  setTimeout(() => {
    if (finished) return;
    if (id !== currentId) {
      finish(); // replaced or stopped while waiting; never spoken
      return;
    }
    synth.speak(u);
  }, delay);
}

export function stopSpeaking() {
  currentId += 1; // ignore late events from the utterance being cancelled
  setSpeaking(false);
  lastCancelAt = performance.now();
  window.speechSynthesis?.cancel();
}
