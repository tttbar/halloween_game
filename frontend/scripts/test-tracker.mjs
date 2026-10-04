import { createTracker } from "../src/presenceTracker.js";
let fails = 0;
const check = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; };

// 1. A big face for 1s becomes "near" only after ~700ms
let t = createTracker(), r;
for (let ms = 0; ms <= 600; ms += 100) r = t.update(ms, 0.2);
check("not near before 700ms", !r.near);
r = t.update(800, 0.2);
check("near after 700ms", r.near && r.seen);

// 2. Passer-by far away: seen but never near
t = createTracker();
for (let ms = 0; ms <= 5000; ms += 100) r = t.update(ms, 0.05);
check("far face is seen but not near", r.seen && !r.near);

// 3. Brief dropouts (<400ms) don't restart the timer
t = createTracker();
t.update(0, 0.2); t.update(200, 0.2); t.update(300, null); t.update(400, null);
r = t.update(750, 0.2);
check("short dropout keeps the near timer", r.near);

// 4. Near persists briefly after leaving, then clears
t = createTracker();
for (let ms = 0; ms <= 1000; ms += 100) t.update(ms, 0.2);
r = t.update(2000, null);
check("still near 1s after leaving", r.near);
r = t.update(3200, null);
check("not near 2.2s after leaving", !r.near);
check("still 'seen' for a few seconds", r.seen);
r = t.update(5200, null);
check("not seen after 4s+ with no face", !r.seen);

// 5. Hysteresis: face shrinking slightly doesn't drop near
t = createTracker();
for (let ms = 0; ms <= 1000; ms += 100) t.update(ms, 0.2);
r = t.update(1100, 0.11);
check("0.11 keeps near (hysteresis, threshold 0.096)", r.near);
r = t.update(1200, 0.05);
for (let ms = 1300; ms <= 3500; ms += 100) r = t.update(ms, 0.05);
check("small face for 2s+ drops near", !r.near);
process.exit(fails ? 1 : 0);
