// Copies the MediaPipe WASM runtime into public/ so the camera feature works
// fully offline (no CDN at the carnival). Runs automatically after `npm install`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("copy-mediapipe: @mediapipe/tasks-vision not installed; skipping.");
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("copy-mediapipe: WASM runtime copied to public/mediapipe/wasm");
}
