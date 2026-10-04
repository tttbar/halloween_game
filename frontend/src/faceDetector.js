// Thin wrapper around MediaPipe's face detector. Everything runs locally in
// the browser: the model and WASM runtime are served from /models and
// /mediapipe, and no image ever leaves the page.
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export async function createFaceDetector() {
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath: "/models/blaze_face_short_range.tflite",
      delegate,
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.5,
  });

  let detector;
  try {
    detector = await FaceDetector.createFromOptions(vision, options("GPU"));
  } catch {
    detector = await FaceDetector.createFromOptions(vision, options("CPU"));
  }

  let lastTs = 0;
  return {
    // source: <video> or <img>. Returns the largest face as
    // { size, cx, cy } (fractions of the frame, 0..1) or null.
    detect(source) {
      const w = source.videoWidth || source.naturalWidth || source.width;
      const h = source.videoHeight || source.naturalHeight || source.height;
      if (!w || !h) return null;
      lastTs = Math.max(lastTs + 1, performance.now()); // must strictly increase
      const { detections } = detector.detectForVideo(source, lastTs);
      let best = null;
      for (const d of detections) {
        const b = d.boundingBox;
        if (b && (!best || b.width > best.width)) best = b;
      }
      if (!best) return null;
      return {
        size: best.width / w,
        cx: (best.originX + best.width / 2) / w,
        cy: (best.originY + best.height / 2) / h,
      };
    },
    close() {
      detector.close();
    },
  };
}
