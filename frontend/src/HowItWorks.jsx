import React, { useEffect, useState } from "react";

// Rotating one-liners on the attract screen: the Innovation Lab pitch for
// parents and coworkers, plus a plain-language note about the camera.
const BASE = [
  "🧠 Gus's brain is an AI running on a computer right here at our table.",
  "🔒 No internet, no cloud — everything stays in this room.",
  "✨ Gus writes brand-new riddles with AI. Ask us how!",
  "🎃 Brought to you by engineers from Innovation Lab.",
  "🛠️ Built on our own time, at home, with our own resources.",
];
const CAMERA_NOTE = "👀 The camera only notices that someone is nearby. Nothing is ever recorded.";

export default function HowItWorks({ cameraOn }) {
  const messages = cameraOn ? [BASE[0], BASE[1], CAMERA_NOTE, ...BASE.slice(2)] : BASE;
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 7000);
    return () => clearInterval(t);
  }, []);

  return (
    <p key={i} className="how-it-works">
      {messages[i % messages.length]}
    </p>
  );
}
