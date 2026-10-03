// Microphone capture for push-to-talk, delivered to the backend over a
// WebSocket. One recording == one answer == one verdict.

export function supportsRecording() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export class PushToTalk {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  // Request mic access once, up front, so the first answer isn't delayed by a
  // permission prompt. Call after a user gesture (e.g. "Start" button).
  async prime() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  start() {
    if (!this.stream) throw new Error("Microphone not primed");
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  // Stops recording and resolves with the recorded Blob.
  stop() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
        return;
      }
      this.recorder.onstop = () =>
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
      this.recorder.stop();
    });
  }

  release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}

// Send a recorded answer blob and resolve with the backend verdict.
export function gradeSpokenAnswer(riddleId, blob) {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/answer`);
    ws.binaryType = "arraybuffer";

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, 25000);

    ws.onopen = async () => {
      ws.send(JSON.stringify({ riddle_id: riddleId }));
      const buf = await blob.arrayBuffer();
      ws.send(buf);
    };
    ws.onmessage = (ev) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(ev.data));
      } catch (e) {
        reject(e);
      }
      ws.close();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("websocket error"));
    };
  });
}
