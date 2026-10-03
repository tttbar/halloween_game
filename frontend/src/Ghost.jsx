import React from "react";

/**
 * Friendly cartoon ghost rendered as inline SVG so it needs no art assets.
 * `mood` drives expression + animation via the wrapping CSS class:
 *   idle | talking | happy | sad
 */
export default function Ghost({ mood = "idle" }) {
  return (
    <div className={`ghost ghost--${mood}`} aria-hidden="true">
      <svg viewBox="0 0 220 260" width="100%" height="100%">
        <defs>
          <radialGradient id="glow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cdd6ff" />
          </radialGradient>
        </defs>

        {/* body */}
        <path
          className="ghost__body"
          d="M110 18
             C58 18 28 58 28 112
             L28 222
             q0 18 16 10 l16 -10 q14 -8 26 0 l10 8 q14 8 26 0 l10 -8 q12 -8 26 0 l16 10 q16 8 16 -10
             L192 112
             C192 58 162 18 110 18 Z"
          fill="url(#glow)"
          stroke="#aab4ff"
          strokeWidth="2"
        />

        {/* eyes */}
        <g className="ghost__eyes" fill="#2b2250">
          <ellipse className="ghost__eye" cx="84" cy="104" rx="14" ry="18" />
          <ellipse className="ghost__eye" cx="136" cy="104" rx="14" ry="18" />
          <circle cx="88" cy="98" r="4" fill="#fff" />
          <circle cx="140" cy="98" r="4" fill="#fff" />
        </g>

        {/* rosy cheeks */}
        <g opacity="0.5">
          <circle cx="66" cy="132" r="9" fill="#ffb3d1" />
          <circle cx="154" cy="132" r="9" fill="#ffb3d1" />
        </g>

        {/* mouth: swapped by mood */}
        <path className="ghost__mouth" d="M94 150 q16 14 32 0" fill="#2b2250" />
      </svg>
    </div>
  );
}
