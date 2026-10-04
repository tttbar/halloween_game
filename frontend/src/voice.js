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

export function speak(text, { onEnd } = {}) {
  const synth = window.speechSynthesis;
  if (!synth) {
    onEnd?.();
    return;
  }
  synth.cancel();
  const id = ++currentId;

  let started = false;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    clearTimeout(startFallback);
    if (id === currentId) setSpeaking(false);
    onEnd?.();
  };
  const begin = () => {
    if (started || finished || id !== currentId) return;
    started = true;
    setSpeaking(true);
  };

  // Some engines never fire "end"; this guarantees the mouth stops and the game
  // can't stall. It's an upper bound only (~85ms per character at our rate).
  const watchdog = setTimeout(finish, 1500 + text.length * 85);
  // Some engines never fire "start"; move the mouth anyway if audio is late.
  const startFallback = setTimeout(begin, 700);

  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 0.9; // slower = clearer for kids
  u.pitch = 0.8; // lower = ghostly
  u.volume = 1;
  u.onstart = begin;
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
}

export function stopSpeaking() {
  currentId += 1; // ignore late events from the utterance being cancelled
  setSpeaking(false);
  window.speechSynthesis?.cancel();
}
