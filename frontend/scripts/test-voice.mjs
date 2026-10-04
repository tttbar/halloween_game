// Tests the speaking-state logic in src/voice.js against a fake speech engine.
class FakeUtterance { constructor(t) { this.text = t; } }
const queue = [];
globalThis.SpeechSynthesisUtterance = FakeUtterance;
globalThis.window = {
  speechSynthesis: {
    getVoices: () => [],
    speak: (u) => queue.push(u),
    cancel: () => {},
  },
};
const { speak, stopSpeaking, isSpeaking } = await import("../src/voice.js");

let fails = 0;
const check = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Normal: mouth follows start/end events exactly
let ended = 0;
speak("Boo!", { onEnd: () => ended++ });
check("not speaking before audio starts", !isSpeaking());
queue.at(-1).onstart();
check("speaking after start event", isSpeaking());
queue.at(-1).onend();
check("stops immediately on end event", !isSpeaking() && ended === 1);

// 2. Engine never fires start: fallback begins the mouth, watchdog ends it
ended = 0;
speak("Hi", { onEnd: () => ended++ });
await wait(800);
check("fallback starts mouth if no start event", isSpeaking());
await wait(1000); // watchdog = 1500 + 2*85 = 1670ms
check("watchdog stops mouth if no end event", !isSpeaking() && ended === 1);

// 3. Race: a late 'end' from the cancelled line must not stop the new line
speak("First line", {});
const first = queue.at(-1);
first.onstart();
speak("Second line", {});
const second = queue.at(-1);
second.onstart();
first.onend(); // stale event arriving after the new line started
check("stale end doesn't silence the new line", isSpeaking());
second.onend();
check("new line's own end stops the mouth", !isSpeaking());

// 4. stopSpeaking silences the mouth immediately, even before events arrive
speak("Another line", {});
queue.at(-1).onstart();
stopSpeaking();
check("stopSpeaking stops mouth immediately", !isSpeaking());
await wait(100);
process.exit(fails ? 1 : 0);
