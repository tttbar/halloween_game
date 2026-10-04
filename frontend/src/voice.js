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

export function speak(text, { onEnd } = {}) {
  const synth = window.speechSynthesis;
  if (!synth) {
    onEnd?.();
    return;
  }
  synth.cancel();

  // Some browsers/voices never fire "end". A watchdog guarantees the game can't
  // stall waiting on the speaker.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    onEnd?.();
  };
  const watchdog = setTimeout(finish, 2000 + text.length * 110);
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 0.9; // slower = clearer for kids
  u.pitch = 0.8; // lower = ghostly
  u.volume = 1;
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
