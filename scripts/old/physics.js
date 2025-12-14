// physics.js
// Φυσική κεντρικού πεδίου + γεωμετρική προεπισκόπηση κωνικών

import {
  G,
  DT_FIXED,
  MAX_STEPS_OPEN,
  MAX_STEPS_CLOSED,
  CRASH_R,
  MAX_R,
  TRAIL_MAX_BOUND,
} from "./config.js";

const PREVIEW_MAX_POINTS = 4000;
const CLOSE_TOL_FRAC = 0.05;
const MIN_STEPS_BEFORE_CLOSE = 200;
const DT = DT_FIXED;

const EPS_U = 1e-8;
const EPS_E = 1e-8;
const EPS_ECIRC = 1e-4;
const EPS_PARAB = 1e-3;

const BODY_DENSITY = 2400; // kg/m^3 (2.4 g/cm^3)

// Ακτίνα "σύγκρουσης" από τη μάζα M, αν είναι ενεργές οι εικόνες.
// Αλλιώς επιστρέφει το default CRASH_R.
function computeCrashRadius(state) {
  // Η ορατότητα εικόνων/χρωμάτων δεν πρέπει να αλλάζει τη "φυσική" ακτίνα σύγκρουσης.
  const M = state && state.M;
  if (Number.isFinite(M) && M > 0) {
    // R = (3M / (4πρ))^(1/3)
    return Math.cbrt((3 * M) / (4 * Math.PI * BODY_DENSITY));
  }
  return CRASH_R;
}

function round2(x) {
  return Number.isFinite(x) ? Number(x.toFixed(2)) : x;
}
function round3(x) {
  return Number.isFinite(x) ? Number(x.toFixed(3)) : x;
}
function tOrbit(key, fallback) {
  if (
    typeof window !== "undefined" &&
    window.I18N &&
    typeof window.I18N.t === "function"
  ) {
    return window.I18N.t(key);
  }
  return fallback;
}

// ========== Βασικά μεγέθη τροχιάς (raw) ==========

function computeConicRaw(state) {
  const r0 = state.r0;
  const u0 = state.u;
  const M = state.M;

  if (!Number.isFinite(r0) || r0 <= 0 || !Number.isFinite(M) || M <= 0) {
    return null;
  }

  const GM = G * M;
  const h = r0 * u0;
  const h2 = h * h;
  const E = 0.5 * u0 * u0 - GM / r0;

  let e2 = 1 + (2 * E * h2) / (GM * GM);
  if (!Number.isFinite(e2) || e2 < 0) e2 = 0;
  const e = Math.sqrt(e2);

  const uc = Math.sqrt(GM / r0);
  const ue = Math.sqrt((2 * GM) / r0);

  const isRadial = Math.abs(u0) < EPS_U;

  // ταξινόμηση με βάση raw αλλά με ανοχές
  let kind = "hyperbola";
  if (isRadial) {
    kind = "radial";
  } else if (E < -EPS_E) {
    if (e < EPS_ECIRC) kind = "circle";
    else if (e < 1 - EPS_PARAB) kind = "ellipse";
    else kind = "ellipse"; // πολύ εκκεντρισμένη αλλά ακόμα δεσμευμένη
  } else if (Math.abs(E) <= EPS_E) {
    kind = "parabola";
  } else {
    kind = "hyperbola";
  }

  return {
    GM,
    r0,
    u0,
    h,
    h2,
    E,
    e,
    uc,
    ue,
    isRadial,
    kind,
  };
}

// ========== Επιτάχυνση ==========

export function acc(state, r) {
  const GM = G * state.M;
  const r2 = r.x * r.x + r.y * r.y;
  const rMag = Math.sqrt(r2) || 1e-12;
  const inv = GM / (r2 * rMag);
  return { x: -inv * r.x, y: -inv * r.y, r: rMag };
}

// ========== Παράμετροι για UI ==========

// ========== Παράμετροι για UI (με βάση τις ΣΤΡΟΓΓΥΛΕΣ τιμές) ==========
export function computeOrbitParams(state) {
  const r0 = state.r0;
  const u = state.u;
  const M = state.M;

  if (!Number.isFinite(r0) || r0 <= 0 || !Number.isFinite(M) || M <= 0) {
    return {
      E: NaN,
      uc: NaN,
      ue: NaN,
      e: NaN,
      type: "—",
      pillClass: "warn",
      Tsec: null,
    };
  }

  const GM = G * M;
  const crashR = state.crashR || CRASH_R;
  const EPS_U = 1e-8;
  const EPS_E_STAB = 1e-4;

  // === raw μεγέθη ===
  const E_raw = 0.5 * u * u - GM / r0;
  const uc_raw = Math.sqrt(GM / r0);
  const ue_raw = Math.sqrt((2 * GM) / r0);
  const h = r0 * u;
  const h2 = h * h;

  // === σταθεροποιημένη ενέργεια για υπολογισμό e ===
  let E_eff = E_raw;
  if (Math.abs(E_raw) < EPS_E_STAB) {
    E_eff = 0;
  }

  let e2 = 1 + (2 * E_eff * h2) / (GM * GM);
  if (!Number.isFinite(e2) || e2 < 0) e2 = 0;
  const e_eff = Math.sqrt(e2); // αυτή την εκκεντρότητα εμφανίζουμε

  // === στρογγυλεμένες τιμές για UI ===
  const E_disp = round3(E_eff);
  const uc_disp = round2(uc_raw);
  const ue_disp = round2(ue_raw);
  const e_disp = round2(e_eff);

  const isRadial = Math.abs(u) < EPS_U;
  const isBoundRaw = E_raw < 0 && !isRadial; // πραγματικά δεσμευμένη τροχιά

  // === Έλεγχος αν μια ελλειπτική τροχιά "χτυπά" το Μ ===
  let hitsStar = false;

  if (isBoundRaw) {
    const p = h2 / GM; // παράμετρος κωνικής
    const denom = 1 + e_eff;
    if (Number.isFinite(p) && denom > 0) {
      const rPeri = p / denom; // περιήλιο
      if (Number.isFinite(rPeri)) {
        hitsStar = rPeri <= crashR + 1e-6;
      }
    }
  }

  // === Ταξινόμηση με βάση τις ΣΤΡΟΓΓΥΛΕΣ τιμές ===
  let typeKey = "—";
  let pillClass = "warn";

  if (isRadial) {
    typeKey = "orbit_type_fall";
    pillClass = "bad";
  } else if (E_disp < 0) {
    // δεσμευμένη τροχιά
    if (e_disp === 0) {
      typeKey = "orbit_type_circle";
    } else {
      typeKey = "orbit_type_ellipse";
    }
    pillClass = "good";
  } else if (E_disp === 0) {
    if (e_disp === 1) {
      typeKey = "orbit_type_parabola";
    } else if (e_disp < 1) {
      typeKey = "orbit_type_ellipse_E0";
      pillClass = "good";
    } else {
      typeKey = "orbit_type_hyperbola_E0";
    }
  } else {
    // E_disp > 0 → μη δεσμευμένη → υπερβολή
    typeKey = "orbit_type_hyperbola_Epos";
    pillClass = "warn";
  }

  const type = typeKey; // το UI θα το μεταφράσει με I18N.t(type)

  // === Περίοδος: μόνο για ΔΕΣΜΕΥΜΕΝΗ έλλειψη ΧΩΡΙΣ σύγκρουση ===
  let Tsec = null;
  if (isBoundRaw && !hitsStar) {
    const a = -GM / (2 * E_raw); // raw E για φυσικά σωστή περίοδο
    if (Number.isFinite(a) && a > 0) {
      Tsec = 2 * Math.PI * Math.sqrt((a * a * a) / GM);
    }
  }

  return {
    E: E_disp,
    uc: uc_disp,
    ue: ue_disp,
    e: e_disp,
    type,
    pillClass,
    Tsec,
  };
}

// ========== Γεωμετρική προεπισκόπηση (previewPath) ==========

function buildGeometricPreview(state) {
  const q = computeConicRaw(state);
  state.previewPath = [];
  state.ellipseGeom = null;
  if (!q) return;

  const { GM, r0, u0, h2, e, isRadial, kind } = q;
  const crashR = state.crashR || CRASH_R;
  // u≈0: ευθεία από r0 στο κέντρο
  if (isRadial) {
    const N = 600;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const x = r0 * (1 - f);
      const y = 0;
      state.previewPath.push({ x, y });
    }
    return;
  }

  const wantUpper = u0 >= 0;

  // ΚΥΚΛΟΣ: ακτίνα r0
  if (kind === "circle") {
    const N = PREVIEW_MAX_POINTS;
    for (let i = 0; i <= N; i++) {
      const phi = (2 * Math.PI * i) / N;
      const x = r0 * Math.cos(phi);
      const y = r0 * Math.sin(phi);
      state.previewPath.push({ x, y });
    }
    const first = state.previewPath[0];
    state.previewPath.push({ x: first.x, y: first.y });

    // Γεωμετρία κλειστής τροχιάς για κύκλο (κέντρο + ακτίνα)
    // ώστε το checkbox "Closed-orbit characteristics" να δείχνει C και R.
    state.ellipseGeom = {
      a: r0,
      b: r0,
      center: { x: 0, y: 0 },
      focus1: { x: 0, y: 0 },
      focus2: { x: 0, y: 0 },
    };
    return;
  }

  // Κωνική με focus στο 0: r(θ)=p/(1+e cosθ)
  const mu = GM;
  const p = h2 / mu;
  const ecc = e;

  if (!Number.isFinite(p) || p <= 0) return;

  // Βρες θ0 ώστε r(θ0)=r0 ⇒ r0 = p / (1 + e cosθ0)
  let cosTheta0;
  if (Math.abs(ecc) < EPS_ECIRC) {
    cosTheta0 = 1;
  } else {
    cosTheta0 = (p / r0 - 1) / ecc;
  }
  if (!Number.isFinite(cosTheta0)) cosTheta0 = 1;
  if (cosTheta0 > 1) cosTheta0 = 1;
  if (cosTheta0 < -1) cosTheta0 = -1;
  const theta0 = Math.acos(cosTheta0); // r(θ0)=r0

  const pts = [];
  const Npts = PREVIEW_MAX_POINTS;

  if (kind === "ellipse") {
    // Έλλειψη: αν δεν χτυπά το Μ → πλήρης κλειστή.
    // Αν το περιήλιο είναι μέσα στο CRASH_R → μόνο το "πάνω" κλαδί
    // και χωρίς τμήματα μέσα στον δίσκο του Μ.

    const rPeri = p / (1 + ecc); // περιήλιο
    let ellipseHitsStar = rPeri <= crashR + 1e-6;
    // ΝΕΟ: γεωμετρία κλειστής τροχιάς (μόνο αν δεν "χτυπά" το Μ)
    if (!ellipseHitsStar) {
      // Από την παράμετρο κωνικής: p = a(1 − e²)
      const a = p / (1 - ecc * ecc);
      if (Number.isFinite(a) && a > 0) {
        const b = a * Math.sqrt(Math.max(0, 1 - ecc * ecc));
        const c = a * ecc;

        // Διεύθυνση κύριου άξονα: από focus (0,0) προς περιήλιο.
        // Με τον τρόπο που ορίζουμε φ = θ − θ0, το περιήλιο είναι στη διεύθυνση:
        const ux = Math.cos(theta0);
        const uy = -Math.sin(theta0);

        // Κέντρο της έλλειψης: μετατόπιση −c * u_axis από την εστία στο 0
        const Cx = -c * ux;
        const Cy = -c * uy;

        const focus1 = { x: 0, y: 0 }; // στο M
        const focus2 = { x: 2 * Cx, y: 2 * Cy }; // συμμετρικό ως προς το κέντρο

        state.ellipseGeom = {
          a,
          b,
          center: { x: Cx, y: Cy },
          focus1,
          focus2,
        };
      }
    }

    const thetaMin = 0;
    const thetaMax = 2 * Math.PI;

    for (let i = 0; i <= Npts; i++) {
      const theta = thetaMin + ((thetaMax - thetaMin) * i) / Npts;
      const denom = 1 + ecc * Math.cos(theta);
      if (Math.abs(denom) < 1e-12) continue;

      let r = p / denom;
      if (!Number.isFinite(r) || r <= 0) continue;

      // Αν η έλλειψη "μπαίνει" μέσα στο Μ, δεν σχεδιάζουμε τα σημεία
      // κάτω από ακτίνα CRASH_R.
      if (ellipseHitsStar && r < crashR) continue;

      const phi = theta - theta0;
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);

      if (ellipseHitsStar) {
        // Σε περίπτωση σύγκρουσης: μόνο το πάνω (ή κάτω) κλαδί,
        // όπως στην υπερβολή/παραβολή.
        if (u0 >= 0 && y < -1e-9) continue; // u0>0 → κρατάμε μόνο y>=0
        if (u0 < 0 && y > 1e-9) continue; // u0<0 → μόνο y<=0
      }

      pts.push({ x, y });
    }

    // Αν ΔΕΝ υπάρχει σύγκρουση → κλείνουμε την έλλειψη όπως πριν.
    if (!ellipseHitsStar && pts.length >= 2) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      const d = Math.hypot(last.x - first.x, last.y - first.y);
      if (d > 1e-6) pts.push({ x: first.x, y: first.y });
    }
  } else if (kind === "parabola") {
    // Παραβολή: μόνο το «πάνω» κλαδί, όπως στην υπερβολή
    const thetaSpan = Math.PI - 0.1; // αποφεύγουμε r→∞ κοντά στο π
    const thetaMin = -thetaSpan;
    const thetaMax = thetaSpan;

    for (let i = 0; i <= Npts; i++) {
      const theta = thetaMin + ((thetaMax - thetaMin) * i) / Npts;

      const denom = 1 + ecc * Math.cos(theta); // ecc≈1
      if (denom <= 0) continue;

      let r = p / denom;
      if (!Number.isFinite(r) || r <= 0 || r > MAX_R) continue;

      // περιστροφή ώστε r(θ0) = r0 να είναι στο (r0, 0)
      const phi = theta - theta0;
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);

      // ➜ κρατάμε ΜΟΝΟ το κλαδί προς την πλευρά της αρχικής ταχύτητας
      if (u0 >= 0 && y < -1e-9) continue; // αν u0>0, κρατάμε μόνο y≥0
      if (u0 < 0 && y > 1e-9) continue; // αν ποτέ u0<0, μόνο y≤0

      pts.push({ x, y });
    }
  } else {
    // υπερβολή
    const thetaLimit = Math.acos(-1 / ecc);
    const thetaSpan = thetaLimit - 0.05;
    const thetaMin = -thetaSpan;
    const thetaMax = thetaSpan;
    for (let i = 0; i <= Npts; i++) {
      const theta = thetaMin + ((thetaMax - thetaMin) * i) / Npts;
      const denom = 1 + ecc * Math.cos(theta);
      if (denom <= 0) continue;
      let r = p / denom;
      if (!Number.isFinite(r) || r <= 0 || r > MAX_R) continue;
      const phi = theta - theta0;
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);
      if (wantUpper && y < -1e-9) continue;
      if (!wantUpper && y > 1e-9) continue;
      pts.push({ x, y });
    }
  }

  if (pts.length >= 2) {
    state.previewPath = pts;
  }
}

// ========== Αριθμητική trajectory (για animation) ==========

// ========== Kepler-based precompute ==========

export function precomputeTrajectory(state) {
  const r0 = state.r0;
  const u0 = state.u;
  const M = state.M;

  // καθαρισμός
  state.previewPath = [];
  state.trajectory = []; // δεν το χρησιμοποιούμε πια για κίνηση
  state.playIndex = 0;
  state.precomputed = false;
  state.crashR = computeCrashRadius(state);
  state.kepler = null;
  state.time = 0;

  state.isBound = false;

  if (
    !Number.isFinite(r0) ||
    r0 <= 0 ||
    !Number.isFinite(M) ||
    M <= 0 ||
    !Number.isFinite(u0)
  ) {
    return;
  }

  const GM = G * M;

  // ============================================================
  // 1) Ειδική περίπτωση: σχεδόν ακτινική (u≈0) → ευθεία προς το Μ
  // ============================================================
  const EPS_U_RADIAL = 1e-8;
  if (Math.abs(u0) < EPS_U_RADIAL) {
    // Χτίζουμε μόνο γεωμετρικό preview (ευθεία)
    buildGeometricPreview(state);

    // Απλή αρχικοποίηση: σώμα στο (r0,0) με μηδενική (ή πολύ μικρή) ταχύτητα
    state.r = { x: r0, y: 0 };
    state.v = { x: 0, y: u0 };
    state.a = acc(state, state.r);
    state.t = 0;
    state.path = [{ x: state.r.x, y: state.r.y }];

    state.trailMaxBound = TRAIL_MAX_BOUND;
    state.precomputed = true;
    state.previewNeedsRedraw = true;
    state.previewVersion = (state.previewVersion | 0) + 1;
    return;
  }

  // ============================================================
  // 2) Γενικά τροχιακά μεγέθη
  // ============================================================
  const E_spec = 0.5 * u0 * u0 - GM / r0; // ειδική ενέργεια
  const h = r0 * u0; // ειδική γωνιακή ορμή (z-component)
  const h2 = h * h;

  // Εκκεντρότητα
  let e2 = 1 + (2 * E_spec * h2) / (GM * GM);
  if (!Number.isFinite(e2) || e2 < 0) e2 = 0;
  const e = Math.sqrt(e2);

  const isBound = E_spec < 0 && e < 1;
  state.isBound = isBound;

  // ============================================================
  // 3) Γεωμετρική τροχιά (ellipse/hyperbola) από τα υπάρχοντα helpers
  // ============================================================
  buildGeometricPreview(state);

  // Αν δεν είναι δεσμευμένη τροχιά → προς το παρόν ΔΕΝ τρέχουμε Kepler,
  // απλά κρατάμε την αρχική κατάσταση.
  if (!isBound) {
    state.r = { x: r0, y: 0 };
    state.v = { x: 0, y: u0 };
    state.a = acc(state, state.r);
    state.t = 0;
    state.time = 0;
    state.path = [{ x: state.r.x, y: state.r.y }];
    state.trailMaxBound = TRAIL_MAX_BOUND;
    state.precomputed = true;
    state.previewNeedsRedraw = true;
    state.previewVersion = (state.previewVersion | 0) + 1;
    return;
  }

  // ============================================================
  // 4) Kepler στοιχεία για ΕΛΛΕΙΨΗ (δεσμευμένη τροχιά)
  // ============================================================
  const a = -GM / (2 * E_spec); // ημιμεγάλος άξονας
  const uc = Math.sqrt(GM / r0); // κυκλική ταχύτητα

  // Ξεκινάμε πάντα με r=(r0,0) και v=(0,u0).
  // Με v ακτινικά = 0, αυτό σημαίνει:
  // - αν u0 < uc → είμαστε στο απόγειο
  // - αν u0 ≥ uc → είμαστε στο περίγειο
  //
  // Στο περιφωκικό σύστημα παίρνουμε:
  //   f0 = 0 στο περίγειο, f0 = π στο απόγειο
  // αλλά θέλουμε ΠΑΝΤΑ x>0 στο t=0 → άρα στο απόγειο θα χρησιμοποιήσουμε signX=-1.
  let signX = 1;
  let E0 = 0;
  let M0 = 0;
  const TOL = 1e-8;

  if (u0 < uc - TOL) {
    // Απόγειο: f0=π, E0=π, M0=π, αλλά περιστροφή κατά π για να έρθει στο +x
    signX = -1;
    E0 = Math.PI;
    M0 = Math.PI;
  } else {
    // Περίγειο ή κυκλική
    signX = 1;
    E0 = 0;
    M0 = 0;
  }

  // Μέση κίνηση και περίοδος
  const n = Math.sqrt(GM / (a * a * a)); // μέση κίνηση
  const T_est = (2 * Math.PI) / n; // περίοδος

  // Εκτίμηση max μήκους ουράς ~ ένα γύρο με βήμα DT_FIXED
  let stepsOnePeriod = Number.isFinite(T_est)
    ? Math.ceil(T_est / DT_FIXED)
    : TRAIL_MAX_BOUND;
  stepsOnePeriod = Math.max(100, Math.min(stepsOnePeriod, TRAIL_MAX_BOUND));

  state.trailMaxBound = stepsOnePeriod;

  // Αποθήκευση Kepler στοιχείων
  state.kepler = {
    GM,
    a,
    e,
    r0,
    u0,
    n,
    M0,
    E0,
    signX,
  };

  // Αρχικές τιμές για κίνηση
  state.r = { x: r0, y: 0 };
  state.v = { x: 0, y: u0 };
  state.a = acc(state, state.r);
  state.t = 0;
  state.time = 0;
  state.path = [{ x: state.r.x, y: state.r.y }];

  state.precomputed = true;
  state.previewNeedsRedraw = true;
  state.previewVersion = (state.previewVersion | 0) + 1;
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

// ========== Kepler βήμα κίνησης (ανά dt) ==========

export function keplerStep(state, dt) {
  const k = state.kepler;
  if (!k) return; // αν δεν έχουν στηθεί τα Kepler στοιχεία, δεν κάνουμε τίποτα

  // ενημέρωση χρόνου
  if (!Number.isFinite(state.time)) state.time = 0;
  state.time += dt;
  const t = state.time;

  const GM = k.GM;
  const a = k.a;
  const e = k.e;
  const n = k.n;

  const TWO_PI = 2 * Math.PI;

  // μέση ανωμαλία
  let M = k.M0 + n * t;
  // φέρνουμε το M στο [0, 2π) για πιο σταθερό Newton
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;

  // επίλυση εξίσωσης Kepler με Newton–Raphson
  let E = M; // αρχική προσέγγιση
  if (e > 0.8) {
    // λίγο καλύτερο guess για μεγάλες εκκεντρότητες
    E = Math.PI;
  }

  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = -f / fp;
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }

  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  // ακτίνα
  const r = a * (1 - e * cosE);
  const xP = a * (cosE - e);
  const yQ = a * Math.sqrt(1 - e * e) * sinE;

  const sign = k.signX || 1;

  const x = sign * xP;
  const y = sign * yQ;

  // ταχύτητες
  const fac = Math.sqrt(GM * a) / r;
  const vxP = -fac * sinE;
  const vyQ = fac * Math.sqrt(1 - e * e) * cosE;

  const vx = sign * vxP;
  const vy = sign * vyQ;

  // ενημέρωση κατάστασης
  state.r = { x, y };
  state.v = { x: vx, y: vy };
  state.a = acc(state, state.r);
  state.t = t;
}


// ========== Γεωμετρική προεπισκόπηση από ΤΡΕΧΟΥΣΑ θέση/ταχύτητα (r, v) ==========
// Χρήσιμο μετά από Impact: θέλουμε τη νέα διακεκομμένη τροχιά χωρίς να αλλάξουμε τους δρομείς.
export function computePreviewFromRV(state, rVec = null, vVec = null) {
  const M = state && state.M;
  if (!Number.isFinite(M) || M <= 0) return { previewPath: [], ellipseGeom: null };

  const GM = G * M;

  const r = rVec || state.r;
  const v = vVec || state.v;

  if (!r || !v) return { previewPath: [], ellipseGeom: null };

  const rx = r.x || 0;
  const ry = r.y || 0;
  const vx = v.x || 0;
  const vy = v.y || 0;

  const rmag = Math.hypot(rx, ry);
  const vmag2 = vx * vx + vy * vy;

  if (!(rmag > 0)) return { previewPath: [], ellipseGeom: null };

  // ειδική ενέργεια
  const E = 0.5 * vmag2 - GM / rmag;

  // ειδική στροφορμή (2D scalar)
  const h = rx * vy - ry * vx;
  const h2 = h * h;

  // σχεδόν ακτινική: δεν ορίζεται καθαρά κωνική
  if (Math.abs(h) < 1e-10) {
    const N = 600;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      pts.push({ x: rx * (1 - f), y: ry * (1 - f) });
    }
    return { previewPath: pts, ellipseGeom: null };
  }

  // εκκεντρότητα (vector)
  const rdotv = rx * vx + ry * vy;
  const factor = (vmag2 - GM / rmag);
  const ex = (factor * rx - rdotv * vx) / GM;
  const ey = (factor * ry - rdotv * vy) / GM;
  const ecc = Math.hypot(ex, ey);

  // παράμετρος κωνικής
  const p = h2 / GM;

  // είδος τροχιάς
  let kind = "hyperbola";
  if (E < -EPS_E) {
    kind = ecc < EPS_ECIRC ? "circle" : "ellipse";
  } else if (Math.abs(E) <= EPS_E) {
    kind = "parabola";
  } else {
    kind = "hyperbola";
  }

  const crashR = state.crashR || CRASH_R;

  // γεωμετρία κλειστής (μόνο αν δεν χτυπάει το M)
  let ellipseGeom = null;
  if (kind === "ellipse" || kind === "circle") {
    const rPeri = p / (1 + ecc);
    const hitsStar = rPeri <= crashR + 1e-6;
    if (!hitsStar) {
      const a = -GM / (2 * E);
      if (Number.isFinite(a) && a > 0) {
        const b = a * Math.sqrt(Math.max(0, 1 - ecc * ecc));
        const c = a * ecc;

        // διεύθυνση περιηλίου: κατά μήκος του e-vector (αν ecc≈0 fallback στον r)
        let ux = ex;
        let uy = ey;
        let ulen = Math.hypot(ux, uy);
        if (ulen < 1e-12) {
          ux = rx / rmag;
          uy = ry / rmag;
          ulen = 1;
        } else {
          ux /= ulen;
          uy /= ulen;
        }

        const Cx = -c * ux;
        const Cy = -c * uy;
        ellipseGeom = {
          a,
          b: kind === "circle" ? a : b,
          center: { x: Cx, y: Cy },
          focus1: { x: 0, y: 0 },
          focus2: { x: 2 * Cx, y: 2 * Cy },
        };
      }
    }
  }

  // βάση προσανατολισμού: u κατά e-vector (ή r αν ecc≈0), v κάθετο
  let ux = ex;
  let uy = ey;
  let ulen = Math.hypot(ux, uy);
  if (ulen < 1e-12) {
    ux = rx / rmag;
    uy = ry / rmag;
    ulen = 1;
  } else {
    ux /= ulen;
    uy /= ulen;
  }
  const vxu = -uy;
  const vyu = ux;

  const pts = [];
  const N = PREVIEW_MAX_POINTS;

  // όρια true anomaly για υπερβολή
  let nuMin = 0;
  let nuMax = 2 * Math.PI;

  if (kind === "hyperbola" && ecc > 1) {
    // r = p/(1+e cos nu) → denom>0
    nuMax = Math.acos(-1 / ecc) - 1e-3;
    nuMin = -nuMax;
  } else if (kind === "parabola") {
    // απλό cutoff γύρω από το περιήλιο
    nuMin = -Math.PI + 1e-3;
    nuMax = Math.PI - 1e-3;
  } else {
    nuMin = 0;
    nuMax = 2 * Math.PI;
  }

  for (let i = 0; i <= N; i++) {
    const nu = nuMin + ((nuMax - nuMin) * i) / N;
    const denom = 1 + ecc * Math.cos(nu);
    if (Math.abs(denom) < 1e-12) continue;

    const rr = p / denom;
    if (!Number.isFinite(rr) || rr <= 0) continue;
    if (rr > MAX_R) break;

    const x = rr * (Math.cos(nu) * ux + Math.sin(nu) * vxu);
    const y = rr * (Math.cos(nu) * uy + Math.sin(nu) * vyu);
    pts.push({ x, y });
  }

  return { previewPath: pts, ellipseGeom };
}
