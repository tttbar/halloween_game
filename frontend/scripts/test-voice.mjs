// Tests the speaking-state and lead-in logic in src/voice.js with a fake speech engine.
class FakeUtterance { constructor(t) { this.text = t; } }
const spoken = []; // utterances actually handed to the engine, with timestamps
const synth = {
  speaking: false,
  pending: false,
  cancels: 0,
  getVoices: () => [],
  speak: (u) => spoken.push({ u, at: performance.now() }),
  cancel() { this.cancels++; },
};
let chimes = 0;
globalThis.SpeechSynthesisUtterance = FakeUtterance;
globalThis.window = { speechSynthesis: synth };
const { speak, stopSpeaking, isSpeaking } = await import("../src/voice.js");

let fails = 0;
const check = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const last = () => spoken.at(-1).u;

// --- Speaking state (no audio context available: no chime, no delay) ---
let ended = 0;
speak("Boo!", { onEnd: () => ended++ });
await wait(10);
check("not speaking before audio starts", !isSpeaking());
last().onstart();
check("speaking after start event", isSpeaking());
last().onend();
check("stops immediately on end event", !isSpeaking() && ended === 1);

ended = 0;
speak("Hi", { onEnd: () => ended++ });
await wait(800);
check("fallback starts mouth if no start event", isSpeaking());
await wait(1000); // watchdog = 1500 + 2*85
check("watchdog stops mouth if no end event", !isSpeaking() && ended === 1);

speak("First line", {});
await wait(10);
const first = last();
first.onstart();
synth.speaking = true;
speak("Second line", {});
await wait(200); // cancel-settle gap
const second = last();
first.onend();
second.onstart();
first.onend(); // stale event arriving after the new line started
check("stale end doesn't silence the new line", isSpeaking());
second.onend();
check("new line's own end stops the mouth", !isSpeaking());
synth.speaking = false;

speak("Another line", {});
await wait(10);
last().onstart();
stopSpeaking();
check("stopSpeaking stops mouth immediately", !isSpeaking());
await wait(300);

// --- Cancel gap: a line right after cancel() must wait before reaching the engine ---
let before = spoken.length;
const t0 = performance.now();
stopSpeaking();
speak("After cancel", {});
await wait(40);
check("line right after cancel is held back", spoken.length === before);
await wait(200);
const waited = spoken.at(-1).at - t0;
check(`line spoken after settle gap (${Math.round(waited)}ms >= 140ms)`, spoken.length === before + 1 && waited >= 140);

// --- Replaced while waiting: never spoken, onEnd still fires so the game moves on ---
before = spoken.length;
let endedA = 0;
stopSpeaking();
speak("Line A", { onEnd: () => endedA++ });
speak("Line B", {});
await wait(300);
const spokenTexts = spoken.slice(before).map((s) => s.u.text);
check("replaced line is never spoken", !spokenTexts.includes("Line A") && spokenTexts.includes("Line B"));
check("replaced line still reports onEnd", endedA === 1);

// --- Chime: after silence, a chime plays and speech waits for it ---
class FakeCtx {
  constructor() { this.currentTime = 0; this.state = "running"; this.destination = {}; chimes++; }
  createOscillator() { return { frequency: {}, connect: (x) => x, start() {}, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x) => x }; }
}
window.AudioContext = FakeCtx;
await wait(5200); // let earlier safety timers expire so the speakers count as idle
before = spoken.length;
const t1 = performance.now();
speak("Hello after silence", {});
check("chime context created after idle", chimes === 1);
await wait(150);
check("speech waits for the chime", spoken.length === before);
await wait(350);
const lead = spoken.at(-1).at - t1;
check(`speech starts after chime (${Math.round(lead)}ms >= 370ms)`, spoken.length === before + 1 && lead >= 370);
last().onstart(); last().onend();

// Back-to-back line: speakers are awake, so no second chime and no big delay
before = spoken.length;
const t2 = performance.now();
speak("Right after", {});
await wait(30);
check("no chime/delay when speakers are already awake", spoken.length === before + 1 && spoken.at(-1).at - t2 < 100);
last().onstart(); last().onend();

process.exit(fails ? 1 : 0);
