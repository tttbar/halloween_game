import React, { useEffect, useState } from "react";

/**
 * Discreet operator control bar for the two of you running the booth.
 * Hidden by default; press the backtick (`) key or tap the tiny corner dot to
 * reveal. Buttons mirror the keyboard shortcuts so either works.
 *
 * Shortcuts:  C=correct  X=wrong  N=next  R=repeat  H=hint  G=AI riddle  L=level  V=camera  T=toggle choices
 */
export default function OperatorBar({
  onCorrect,
  onWrong,
  onNext,
  onRepeat,
  onConjure,
  onToggleCamera,
  onToggleLevel,
  camera,
  level,
  onHint,
  riddleNumber,
  total,
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "`") setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        className="op-toggle"
        title="Operator controls (`)"
        onClick={() => setOpen((o) => !o)}
      >
        •
      </button>
      {open && (
        <div className="op-bar">
          <span className="op-count">
            Riddle {riddleNumber}/{total} · level: {level || "—"}
          </span>
          <span className="op-count">
            📷 {camera.on ? camera.status : "off"}
            {camera.status === "ready" &&
              ` · face ${camera.faceSize.toFixed(2)} · ${camera.near ? "NEAR" : camera.seen ? "seen" : "nobody"}`}
          </span>
          <button onClick={onCorrect}>✓ Correct (C)</button>
          <button onClick={onWrong}>✗ Wrong (X)</button>
          <button onClick={onRepeat}>↻ Repeat (R)</button>
          <button onClick={onConjure}>✨ AI Riddle (G)</button>
          <button onClick={onToggleLevel}>
            {level === "little" ? "🧒 Switch to Big (L)" : "🐣 Switch to Little (L)"}
          </button>
          <button onClick={onToggleCamera}>
            {camera.on ? "📷 Camera off (V)" : "📷 Camera on (V)"}
          </button>
          <button onClick={onHint}>💡 Hint (H)</button>
          <button onClick={onNext}>→ Next (N)</button>
        </div>
      )}
    </>
  );
}
