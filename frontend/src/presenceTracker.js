// Presence tracking: turns a stream of "how big is the biggest face?"
// observations into stable near / seen flags. Pure logic (no browser APIs) so
// it can be unit-tested.
//
//   near  - someone is close enough to invite (face is big in the frame)
//   seen  - a face is visible at all (used to detect everyone walking away)

export function createTracker({
  nearSize = 0.12, // face width as a fraction of frame width to count as "near"
  enterMs = 700, // must stay near this long before we call it "near"
  gapMs = 400, // brief detection dropouts don't restart the timer
  leaveNearMs = 2000, // how long without a near face before "near" turns off
  leaveSeenMs = 4000, // how long without any face before "seen" turns off
} = {}) {
  let near = false;
  let seen = false;
  let nearSince = null;
  let lastNear = -Infinity;
  let lastSeen = -Infinity;

  return {
    // faceSize: width fraction of the largest face, or null if no face.
    update(now, faceSize) {
      if (faceSize != null) {
        lastSeen = now;
        seen = true;
      } else if (seen && now - lastSeen >= leaveSeenMs) {
        seen = false;
      }

      // Hysteresis: easier to stay near than to become near.
      const threshold = near ? nearSize * 0.8 : nearSize;
      if (faceSize != null && faceSize >= threshold) {
        lastNear = now;
        if (nearSince === null) nearSince = now;
        if (!near && now - nearSince >= enterMs) near = true;
      } else {
        if (now - lastNear > gapMs) nearSince = null;
        if (near && now - lastNear >= leaveNearMs) near = false;
      }
      return { near, seen };
    },
  };
}
