// physics.js
// Απλοποιημένη φυσική με σταθερό dt (από config)

import {
  G,
  DT_FIXED,
  MAX_STEPS_OPEN,
  MAX_STEPS_CLOSED,
  CRASH_R,
  MAX_R,
  TRAIL_MAX_BOUND,
} from "./config.js";

const PREVIEW_MAX_POINTS = 40000; // upper bound για τη διακεκομμένη
const CLOSE_TOL_FRAC = 0.05; // 5% της r0 για «κλείσιμο» ελλειπτικής
const MIN_STEPS_BEFORE_CLOSE = 200; // όχι πρόωρο κλείσιμο

const DT = DT_FIXED;

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/** Επιτάχυνση βαρύτητας */
export function acc(state, r) {
  const GM = G * state.M;
  const r2 = r.x * r.x + r.y * r.y;
  const rMag = Math.sqrt(r2) || 1e-12;
  const inv = GM / (r2 * rMag);
  return { x: -inv * r.x, y: -inv * r.y, r: rMag };
}

/** Εκκεντρότητα από αρχικές συνθήκες (info UI) */
export function eccFromInit(state) {
  const r0 = state.r0,
    u = state.u,
    GM = G * state.M;
  const h = r0 * u;
  const E = 0.5 * u * u - GM / r0;
  const e2 = 1 + (2 * E * h * h) / (GM * GM);
  return Math.max(0, e2) ** 0.5;
}

/** Μεγέθη για UI (στρογγυλεμένα) */
export function computeOrbitParams(state) {
  const r0 = state.r0,
    u = state.u,
    GM = G * state.M;

  const E_raw = 0.5 * u * u - GM / r0;
  const uc_raw = Math.sqrt(GM / r0);
  const ue_raw = Math.sqrt((2 * GM) / r0);
  const e_raw = eccFromInit(state);

  const E = round3(E_raw);
  const uc = round3(uc_raw);
  const ue = round3(ue_raw);
  const e = round3(e_raw);

  let type = "—",
    pillClass = "warn";
  if (u === 0) {
    type = "Πτώση (u=0)";
    pillClass = "bad";
  } else if (E < 0) {
    if (Math.abs(u - uc_raw) < 1e-6) {
      type = "Κύκλος (E<0, e=0)";
      pillClass = "good";
    } else {
      type = "Έλλειψη (E<0, 0<e<1)";
      pillClass = "good";
    }
  } else if (E === 0 && e === 1) {
    type = "Παραβολή (E=0, e=1)";
    pillClass = "warn";
  } else {
    type = "Υπερβολή (E>0, e>1)";
    pillClass = "warn";
  }

  // Περίοδος μόνο για E<0 (χρησιμοποιεί RAW E!)
  let Tsec = null;
  if (E < 0) {
    const a = -(G * state.M) / (2 * E_raw);
    if (Number.isFinite(a) && a > 0) {
      Tsec = 2 * Math.PI * Math.sqrt((a * a * a) / (G * state.M));
    }
  }
  return { E, uc, ue, e, type, pillClass, Tsec };
}

/** Προϋπολογισμός τροχιάς με σταθερό dt, απλή λογική bound/unbound */
export function precomputeTrajectory(state) {
  const GM = G * state.M;
  const r0 = state.r0;
  const u0 = state.u;

  // reset containers
  state.previewPath = [];
  state.trajectory = [];
  state.playIndex = 0;
  state.precomputed = false;

  state.crashR = CRASH_R;

  // u=0: ελεύθερη πτώση (οπτική γραμμή μέχρι το κέντρο)
  // u=0: ελεύθερη πτώση (οπτική γραμμή μέχρι το κέντρο)
  if (u0 === 0) {
    const N = 600,
      dtFake = 1 / 60;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const x = r0 * (1 - f),
        y = 0;
      state.trajectory.push({ t: i * dtFake, x, y, vx: 0, vy: 0 });
      state.previewPath.push({ x, y });
    }

    state.isBound = true;
    state.closedNumerically = false;

    // ΣΗΜΑΝΤΙΚΟ: δηλώνουμε ότι η τροχιά έχει προϋπολογιστεί,
    // αλλιώς το κουμπί "Έναρξη" δεν θα ξεκινά.
    state.precomputed = true;
    state.trailMaxBound = Math.min(state.trajectory.length, TRAIL_MAX_BOUND);
    state.previewNeedsRedraw = true;
    state.previewVersion = (state.previewVersion | 0) + 1;

    finishSetInitial(state);
    return;
  }

  // Απόφαση με στρογγυλεμένη E
  const E_raw = 0.5 * u0 * u0 - GM / r0;
  const E_round = round3(E_raw);
  const isBound = E_round < 0;

  state.isBound = isBound;
  state.closedNumerically = isBound;

  // Στόχος βημάτων
  let maxSteps,
    stride = 1;
  if (isBound) {
    // 1 περίοδος
    let T_est = null;
    const a = -GM / (2 * E_raw);
    if (Number.isFinite(a) && a > 0) {
      T_est = 2 * Math.PI * Math.sqrt((a * a * a) / GM);
    }
    const stepsOnePeriod = Number.isFinite(T_est)
      ? Math.ceil(T_est / DT)
      : 20000;
    maxSteps = Math.min(stepsOnePeriod, MAX_STEPS_CLOSED);
    stride =
      maxSteps > PREVIEW_MAX_POINTS
        ? Math.floor(maxSteps / PREVIEW_MAX_POINTS)
        : 1;
  } else {
    maxSteps = MAX_STEPS_OPEN; // ανοικτές
    stride = 1;
  }

  // Ολοκλήρωση (Velocity-Verlet)
  let t = 0;
  let r = { x: r0, y: 0 };
  let v = { x: 0, y: u0 };

  function accLocal(rr) {
    const r2 = rr.x * rr.x + rr.y * rr.y;
    const rMag = Math.sqrt(r2) || 1e-12;
    const inv = GM / (r2 * rMag);
    return { x: -inv * rr.x, y: -inv * rr.y, r: rMag };
  }
  let a = accLocal(r);

  state.trajectory.push({ t, x: r.x, y: r.y, vx: v.x, vy: v.y });
  state.previewPath.push({ x: r.x, y: r.y });

  for (let i = 1; i <= maxSteps; i++) {
    const a0 = a;

    const r1 = {
      x: r.x + v.x * DT + 0.5 * a0.x * DT * DT,
      y: r.y + v.y * DT + 0.5 * a0.y * DT * DT,
    };
    const a1 = accLocal(r1);

    const v1 = {
      x: v.x + 0.5 * (a0.x + a1.x) * DT,
      y: v.y + 0.5 * (a0.y + a1.y) * DT,
    };

    t += DT;
    r = r1;
    v = v1;
    a = a1;

    const rmag = Math.hypot(r.x, r.y);

    // stop σε πρόσκρουση
    if (rmag <= CRASH_R) {
      state.trajectory.push({ t, x: 0, y: 0, vx: v.x, vy: v.y });
      state.previewPath.push({ x: 0, y: 0 });
      break;
    }
    // ανοικτές: κόφτης
    if (!isBound && rmag > MAX_R) {
      state.trajectory.push({ t, x: r.x, y: r.y, vx: v.x, vy: v.y });
      state.previewPath.push({ x: r.x, y: r.y });
      break;
    }

    state.trajectory.push({ t, x: r.x, y: r.y, vx: v.x, vy: v.y });
    if (stride === 1 || i % stride === 0) {
      state.previewPath.push({ x: r.x, y: r.y });
    }

    // Κλείσιμο κύκλου (μόνο για bound)
    if (isBound && i > MIN_STEPS_BEFORE_CLOSE) {
      const first = state.trajectory[0];
      const d = Math.hypot(r.x - first.x, r.y - first.y);
      const tolClose = CLOSE_TOL_FRAC * r0;
      if (d < tolClose) {
        break; // κλείσαμε μία περίοδο «αρκετά κοντά»
      }
    }
  }

  // Βάλε και το τελευταίο σημείο στο preview (αν λείπει)
  const last = state.trajectory[state.trajectory.length - 1];
  const pl = state.previewPath[state.previewPath.length - 1];
  if (!pl || pl.x !== last.x || pl.y !== last.y) {
    state.previewPath.push({ x: last.x, y: last.y });
  }

  // Τέλος: flags/caches
  state.precomputed = true;
  state.playIndex = 0;
  state.previewNeedsRedraw = true;
  state.previewVersion = (state.previewVersion | 0) + 1;

  // Ουρά: για κλειστές μισή-μία περίοδο; κρατάμε όσο παρήχθη + cap
  if (isBound) {
    state.trailMaxBound = Math.min(state.trajectory.length, TRAIL_MAX_BOUND);
  } else {
    state.trailMaxBound = TRAIL_MAX_BOUND;
  }

  finishSetInitial(state);
}

function finishSetInitial(state) {
  if (state.trajectory.length > 0) {
    const s0 = state.trajectory[0];
    state.r = { x: s0.x, y: s0.y };
    state.v = { x: s0.vx, y: s0.vy };
    state.a = acc(state, state.r);
    state.t = s0.t;
    state.path = [{ x: s0.x, y: s0.y }];
  }
}
