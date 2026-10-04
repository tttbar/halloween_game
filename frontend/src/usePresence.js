import { useEffect, useRef, useState } from "react";
import { createFaceDetector } from "./faceDetector.js";
import { createTracker } from "./presenceTracker.js";

const POLL_MS = 120; // ~8 detections per second is plenty and light on the GPU

// Set to true if Gus's eyes look the wrong way (camera image is mirrored
// relative to the screen, so normally we flip it).
const FLIP_X = true;

function setGaze(x, y) {
  const root = document.documentElement.style;
  root.setProperty("--gaze-x", x.toFixed(3));
  root.setProperty("--gaze-y", y.toFixed(3));
}

/**
 * Webcam presence detection. Returns:
 *   status: "off" | "loading" | "ready" | "error"
 *   near / seen: see presenceTracker.js
 *   faceSize: latest face width fraction (for the operator's tuning readout)
 * Also drives Gus's eyes via --gaze-x / --gaze-y CSS variables.
 */
export function usePresence(enabled, nearSize = 0.12) {
  const [status, setStatus] = useState("off");
  const [flags, setFlags] = useState({ near: false, seen: false });
  const [faceSize, setFaceSize] = useState(0);
  const flagsRef = useRef(flags);

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setFlags({ near: false, seen: false });
      flagsRef.current = { near: false, seen: false };
      setGaze(0, 0);
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let stream = null;
    let detector = null;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;

    (async () => {
      try {
        setStatus("loading");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        detector = await createFaceDetector();
        if (cancelled) {
          detector.close();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setStatus("ready");

        const tracker = createTracker({ nearSize });
        const gaze = { x: 0, y: 0 };
        let lastDebug = 0;

        timer = setInterval(() => {
          if (video.readyState < 2) return;
          const now = performance.now();
          const face = detector.detect(video);

          const next = tracker.update(now, face ? face.size : null);
          if (next.near !== flagsRef.current.near || next.seen !== flagsRef.current.seen) {
            flagsRef.current = next;
            setFlags(next);
          }
          if (now - lastDebug > 500) {
            lastDebug = now;
            setFaceSize(face ? face.size : 0);
          }

          // Ease the eyes toward the person (or back to center when alone).
          const tx = face ? Math.max(-1, Math.min(1, (FLIP_X ? 0.5 - face.cx : face.cx - 0.5) * 2)) : 0;
          const ty = face ? Math.max(-1, Math.min(1, (face.cy - 0.5) * 2)) : 0;
          gaze.x += (tx - gaze.x) * 0.4;
          gaze.y += (ty - gaze.y) * 0.4;
          setGaze(gaze.x, gaze.y);
        }, POLL_MS);
      } catch (err) {
        console.warn("Camera presence unavailable:", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      detector?.close();
      video.srcObject = null;
      setGaze(0, 0);
    };
  }, [enabled, nearSize]);

  return { status, near: flags.near, seen: flags.seen, faceSize };
}
