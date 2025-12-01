// physics.js
// Φυσική: επιτάχυνση, εκκεντρότητα, χαρακτηρισμός τροχιάς,
// και προϋπολογισμός πλήρους τροχιάς (trajectory + previewPath).

import { G } from "./config.js";

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// Ελέγχει αν η τροχιά είναι "σχεδόν παραβολή" με βάση τα 3 πρώτα & 3 τελευταία σημεία
function isAlmostParabolicByEnds(traj) {
  if (!Array.isArray(traj) || traj.length < 3) return false;

  const n = traj.length;
  if (n < 3) return false;

  const dist = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  };

  // 3 πρώτα
  const p0 = traj[0];
  const p1 = traj[1];
  const p2 = traj[2];

  // 3 τελευταία
  const pn2 = traj[n - 3];
  const pn1 = traj[n - 2];
  const pn = traj[n - 1];

  // 1) μέση απόσταση διαδοχικά στα 3 πρώτα
  const dstart = (dist(p0, p1) + dist(p1, p2)) / 2;

  // 2) μέση απόσταση διαδοχικά στα 3 τελευταία
  const dend = (dist(pn2, pn1) + dist(pn1, pn)) / 2;

  // 3) απόσταση πρώτου–τελευταίου
  const Dtotal = dist(p0, pn);

  const ref = Math.max(dstart, dend);

  if (!Number.isFinite(ref) || ref === 0) return false;

  const isAlmost = Dtotal > 10 * ref;

  // Αν θες debug:
  //console.log("parabolic check:", { dstart, dend, Dtotal, ref, isAlmost });

  return isAlmost;
}

/**
 * Επιτάχυνση λόγω κεντρικής βαρύτητας στο σημείο r.
 * Επιστρέφει και το μέτρο rMag.
 */
export function acc(state, r) {
  const GM = G * state.M;
  const r2 = r.x * r.x + r.y * r.y;
  const rMag = Math.sqrt(r2) || 1e-12;
  const inv = GM / (r2 * rMag); // GM / r^3
  return { x: -inv * r.x, y: -inv * r.y, r: rMag };
}

/**
 * Εκκεντρότητα e από τις αρχικές συνθήκες (r0, u).
 */
export function eccFromInit(state) {
  const r0 = state.r0;
  const u = state.u;
  const GM = G * state.M;
  const h = r0 * u; // στροφορμή ανά μονάδα μάζας
  const E = 0.5 * u * u - GM / r0; // ειδική μηχανική ενέργεια
  const e2 = 1 + (2 * E * h * h) / (GM * GM);
  return Math.max(0, e2) ** 0.5;
}

/**
 * Υπολογίζει τα βασικά μεγέθη τροχιάς:
 *  - ενέργεια E0
 *  - κυκλική ταχύτητα uc
 *  - ταχύτητα διαφυγής ue
 *  - εκκεντρότητα e
 *  - λεκτικό τύπο τροχιάς και pillClass για το UI
 */
export function computeOrbitParams(state) {
  const r0 = state.r0;
  const u = state.u;
  const GM = G * state.M;

  // RAW
  const E_raw = 0.5 * u * u - GM / r0;
  const uc_raw = Math.sqrt(GM / r0);
  const ue_raw = Math.sqrt((2 * GM) / r0);
  const e_raw = eccFromInit(state);

  const closed =
    state.closedNumerically === undefined ? true : state.closedNumerically;

  // ταξινόμηση (όπως την έχεις ήδη) ...
  let type = "—";
  let pillClass = "warn";
  if (u === 0) {
    type = "Πτώση (u=0)";
    pillClass = "bad";
  } else if (E_raw < 0) {
    if (!closed) {
      type = "Σχεδόν Παραβολή";
      pillClass = "warn";
    } else if (Math.abs(u - uc_raw) < 1e-6) {
      type = "Κύκλος (E<0, e=0)";
      pillClass = "good";
    } else {
      type = "Έλλειψη (E<0, 0<e<1)";
      pillClass = "good";
    }
  } else if (Math.abs(E_raw) < 1e-9) {
    type = "Παραβολή (E=0, e=1)";
    pillClass = "warn";
  } else {
    type = "Υπερβολή (E>0, e>1)";
    pillClass = "warn";
  }

  // στρογγυλοποίηση για εμφάνιση
  const round3 = (x) => Math.round(x * 1000) / 1000;
  let E = round3(E_raw);
  let uc = round3(uc_raw);
  let ue = round3(ue_raw);
  let e = round3(e_raw);

  // override: αν στρογγυλεμένα E=0 & e=1 → Παραβολή
  if (u > 0 && E === 0 && e === 1) {
    type = "Παραβολή (E=0, e=1)";
    pillClass = "warn";
  }

  // === Περίοδος Τ για E<0 (έλλειψη/κύκλος) ===
  // a = -GM/(2E_raw),  T = 2π sqrt(a^3/GM)
  let Tsec = null;
  if (E_raw < 0) {
    const a = -GM / (2 * E_raw); // ημιμεγάλη διάμετρος (m)
    if (Number.isFinite(a) && a > 0) {
      Tsec = 2 * Math.PI * Math.sqrt((a * a * a) / GM); // σε δευτερόλεπτα
    }
  }

  return { E, uc, ue, e, type, pillClass, Tsec };
}

/**
 * Φτιάχνει αναλυτική παραβολική τροχιά (σχεδόν παραβολή) που:
 *  - περνά από το (r0, 0) στο perihelion (θ = 0),
 *  - έχει "παραβολική" ταχύτητα στο perihelion: v_p = √(2GM/r0),
 *  - γεμίζει state.trajectory και state.previewPath
 *  - ρυθμίζει state ώστε το animation να ξεκινά από αυτό το σημείο.
 *
 * Χρησιμοποιούμε τον πολικό τύπο παραβολής:
 *      r(θ) = p / (1 + cos θ),   με e = 1
 * και επιλέγουμε p = 2 r0 ώστε r(0) = r0.
 */
function buildParabolicApprox(
  state,
  GM,
  TARGET_STEPS_BOUND,
  TARGET_PREVIEW_POINTS
) {
  const r0 = state.r0;
  const steps = TARGET_STEPS_BOUND;

  const p = 2 * r0; // ώστε r(0) = p / (1+1) = p/2 = r0
  const thetaMax = Math.PI - 0.2; // αποφεύγουμε cos θ ≈ -1 (r -> ∞)
  const dTheta = thetaMax / (steps - 1);

  const pts = [];
  for (let i = 0; i < steps; i++) {
    const theta = i * dTheta;
    const denom = 1 + Math.cos(theta);
    const r = p / (denom || 1e-6);
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    pts.push({ x, y });
  }

  // Ταχύτητες από διαφορικό των θέσεων, με scale ώστε
  // στο perihelion να ταιριάζει περίπου η παραβολική ταχύτητα.
  let vx0 = pts[1].x - pts[0].x;
  let vy0 = pts[1].y - pts[0].y;
  const vmag0 = Math.hypot(vx0, vy0) || 1e-8;
  const vParab = Math.sqrt((2 * GM) / r0); // παραβολική ταχύτητα σε r0
  const scaleVel = vParab / vmag0;

  const trajectory = [];
  const dtFake = 1; // "χρόνος" για το animation (όχι φυσικός)

  for (let i = 0; i < steps; i++) {
    let vx, vy;
    if (i === 0) {
      vx = (pts[1].x - pts[0].x) * scaleVel;
      vy = (pts[1].y - pts[0].y) * scaleVel;
    } else if (i === steps - 1) {
      vx = (pts[i].x - pts[i - 1].x) * scaleVel;
      vy = (pts[i].y - pts[i - 1].y) * scaleVel;
    } else {
      vx = (pts[i + 1].x - pts[i - 1].x) * 0.5 * scaleVel;
      vy = (pts[i + 1].y - pts[i - 1].y) * 0.5 * scaleVel;
    }
    trajectory.push({
      t: i * dtFake,
      x: pts[i].x,
      y: pts[i].y,
      vx,
      vy,
    });
  }

  // Προεπισκόπηση (διακεκομμένη) με μέχρι TARGET_PREVIEW_POINTS σημεία
  const stridePrev =
    steps > TARGET_PREVIEW_POINTS
      ? Math.floor(steps / TARGET_PREVIEW_POINTS)
      : 1;

  const preview = [];
  for (let i = 0; i < steps; i++) {
    if (i % stridePrev === 0) {
      preview.push({ x: pts[i].x, y: pts[i].y });
    }
  }

  state.trajectory = trajectory;
  state.previewPath = preview;
  state.playIndex = 0;
  state.isAlmostParabolic = true;
  state.isBound = false;
  state.closedNumerically = false; // 🔴 ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ
  state.precomputed = true;

  const s0 = trajectory[0];
  const a0 = acc(state, { x: s0.x, y: s0.y });

  state.r = { x: s0.x, y: s0.y };
  state.v = { x: s0.vx, y: s0.vy };
  state.a = { x: a0.x, y: a0.y };
  state.t = s0.t;
  state.path = [{ x: s0.x, y: s0.y }];
}

/**
 * Προϋπολογίζει ΟΛΗ την τροχιά.
 *
 * ΚΛΕΙΣΤΕΣ τροχιές (E<0):
 *  - Υπολογίζει την περίοδο Τ αναλυτικά από τον νόμο του Kepler.
 *  - Ορίζει dtPre = T / TARGET_STEPS (π.χ. 5000).
 *  - Κάνει ακριβώς TARGET_STEPS βήματα (Velocity Verlet).
 *  - Στο τέλος ελέγχει αν "κλείνει". Αν όχι και e≈1 -> "Σχεδόν Παραβολή".
 *
 * ΑΝΟΙΚΤΕΣ τροχιές:
 *  - Χρησιμοποιεί σταθερό dtPre = 0.01
 *  - Σταματά όταν r γίνει πολύ μεγάλο ή φτάσει σε maxSteps.
 *
 * Γεμίζει:
 *   - state.trajectory = [{t,x,y,vx,vy}, ...]  (όλα τα βήματα)
 *   - state.previewPath = το πολύ TARGET_PREVIEW_POINTS σημεία
 * και μηδενίζει state.playIndex.
 */
export function precomputeTrajectory(state) {
  const GM = G * state.M;
  const r0 = state.r0;
  const u0 = state.u;

  const E0 = 0.5 * u0 * u0 - GM / r0;
  const bound = E0 < 0; // true = έλλειψη/κύκλος
  state.isBound = bound;
  state.closedNumerically = true; // default, θα το αλλάξουμε αν δούμε ότι ΔΕΝ κλείνει
  state.isAlmostParabolic = false;

  state.previewPath = [];
  state.trajectory = [];

  // u0 = 0 -> πτώση
  // u0 = 0 -> ευθύγραμμη πτώση (φτιάξε πολλά samples για ορατή κίνηση)
  if (u0 === 0) {
    const N = 600; // όσα περισσότερα, τόσο πιο ομαλό
    const dtFake = 1 / 60; // «εικονικό» βήμα χρόνου για playback
    state.trajectory = [];
    state.previewPath = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N; // 0..1
      const x = r0 * (1 - f); // από r0 → 0 επάνω στον άξονα x
      const y = 0;
      state.trajectory.push({ t: i * dtFake, x, y, vx: 0, vy: 0 });
      state.previewPath.push({ x, y });
    }

    state.isBound = true; // δεσμευμένη κίνηση με E<0
    state.closedNumerically = false;
    state.isAlmostParabolic = false;

    state.playIndex = 0;
    state.precomputed = true;
    return;
  }

  // --- Ρυθμίσεις
  const TARGET_STEPS_BOUND = 5000;
  const TARGET_PREVIEW_POINTS = 40000;
  const maxStepsUnbound = 80000;
  const crashR = 6;
  state.crashR = crashR; // ώστε να τη βλέπει και το draw.js

  const maxR = 5000;

  // ΝΕΟ: όριο για «σχεδόν παραβολική» δεσμευμένη (E≈0−)
  const EPS_E_PAR = 0.02; // 2% του GM/r0

  let dtPre;
  let steps;

  if (bound && E0 < 0) {
    const aK = -GM / (2 * E0);
    const normE = Math.abs(E0) / (GM / r0); // πόσο «μικρή» είναι η |E| σε μονάδες GM/r0
    const nearParabolicBound =
      Number.isFinite(aK) && aK > 0 && normE < EPS_E_PAR;

    if (nearParabolicBound) {
      // Οριακά δεσμευμένη σχεδόν-παραβολική: ΜΗΝ χρησιμοποιείς T/5000
      steps = Math.min(120000, maxStepsUnbound);
      dtPre = 0.01; // πυκνά βήματα για καθαρή καμπύλη
    } else if (Number.isFinite(aK) && aK > 0) {
      const T = 2 * Math.PI * Math.sqrt((aK * aK * aK) / GM);
      steps = TARGET_STEPS_BOUND;
      dtPre = T / TARGET_STEPS_BOUND;
    } else {
      steps = TARGET_STEPS_BOUND;
      dtPre = 0.05;
    }
  } else {
    // ΑΝΟΙΚΤΗ τροχιά
    dtPre = 0.05;
    steps = maxStepsUnbound;
  }

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

  // stride ώστε η previewPath να μην ξεπερνά τα TARGET_PREVIEW_POINTS
  // Στις ανοικτές/σχεδόν παραβολικές δεν αραιώνουμε καθόλου το preview
  const normE = Math.abs(E0) / (GM / r0);
  const nearParabolicBound = bound && normE < EPS_E_PAR;

  // Στις ανοικτές ή near-parabolic bound ΜΗΝ αραιώνεις το preview
  const stride =
    !bound || nearParabolicBound
      ? 1
      : steps > TARGET_PREVIEW_POINTS
      ? Math.floor(steps / TARGET_PREVIEW_POINTS)
      : 1;

  // αρχικό δείγμα
  state.trajectory.push({ t, x: r.x, y: r.y, vx: v.x, vy: v.y });
  state.previewPath.push({ x: r.x, y: r.y });

  // Velocity Verlet integration
  for (let i = 0; i < steps; i++) {
    const a0 = a;
    const r1 = {
      x: r.x + v.x * dtPre + 0.5 * a0.x * dtPre * dtPre,
      y: r.y + v.y * dtPre + 0.5 * a0.y * dtPre * dtPre,
    };
    const a1 = accLocal(r1);
    const v1 = {
      x: v.x + 0.5 * (a0.x + a1.x) * dtPre,
      y: v.y + 0.5 * (a0.y + a1.y) * dtPre,
    };

    t += dtPre;
    r = r1;
    v = v1;
    a = a1;

    const rmag = Math.hypot(r.x, r.y);

    // --- ΣΤΟΠ ΣΕ ΠΡΟΣΚΡΟΥΣΗ: ισχύει για ΟΛΕΣ τις τροχιές όταν είναι ενεργό
    if (state.stopOnCrash && rmag <= crashR) {
      // Βάλε ΤΕΛΕΥΤΑΙΟ σημείο το κέντρο (ή ακτίνα crashR)
      const xCrash = 0;
      const yCrash = 0;

      state.trajectory.push({ t, x: xCrash, y: yCrash, vx: v.x, vy: v.y });

      // φρόντισε να μπει και στη διακεκομμένη, ακόμα κι αν δεν "έπεσε" στο stride
      const lastPrev = state.previewPath[state.previewPath.length - 1];
      if (!lastPrev || lastPrev.x !== xCrash || lastPrev.y !== yCrash) {
        state.previewPath.push({ x: xCrash, y: yCrash });
      }
      break; // τερμάτισε την ολοκλήρωση εδώ
    }

    // --- όριο μέγιστης απόστασης για ανοικτές
    if (!bound && rmag > maxR) {
      break;
    }

    // πλήρης τροχιά για playback
    state.trajectory.push({ t, x: r.x, y: r.y, vx: v.x, vy: v.y });

    // διακεκομμένη (αραιό sampling)
    if ((i + 1) % stride === 0) {
      state.previewPath.push({ x: r.x, y: r.y });
    }
  }

  // σιγουρέψου ότι το τελευταίο σημείο είναι μέσα στην preview
  if (state.trajectory.length > 0) {
    const last = state.trajectory[state.trajectory.length - 1];
    const pl = state.previewPath[state.previewPath.length - 1];
    if (!pl || pl.x !== last.x || pl.y !== last.y) {
      state.previewPath.push({ x: last.x, y: last.y });
    }
  }

  // --- Έλεγχος "κλεισίματος" για κλειστές τροχιές, ειδικά όταν e ~ 1
  if (bound && state.trajectory.length >= 6) {
    const e = eccFromInit(state);
    const traj = state.trajectory;
    const first = traj[0];

    // αγνοούμε τα πρώτα 10%
    const N = traj.length;
    const startIndex = Math.floor(N * 0.1);

    let minDist = Infinity;
    for (let i = startIndex; i < N; i++) {
      const p = traj[i];
      const d = Math.hypot(p.x - first.x, p.y - first.y);
      if (d < minDist) minDist = d;
    }

    const tolClose = 0.05 * r0;

    // ====== κριτήριο άκρων ======
    const almostByEnds = isAlmostParabolicByEnds(traj);

    // === ΦΡΕΝΟ για μικρές ταχύτητες: ΠΑΝΤΑ έλλειψη, όχι "σχεδόν παραβολή"
    const u_circ = Math.sqrt(GM / r0);
    const verySmallSpeed = u0 > 0 && u0 < 0.3 * u_circ; // 30% της κυκλικής

    // === Ενεργοποίησε "σχεδόν παραβολή" ΜΟΝΟ αν είμαστε ΠΑΡΑ πολύ κοντά στο e=1
    const closeToParabola =
      e > 0.995 && ((e > 0.95 && minDist > tolClose) || almostByEnds);

    // Debug αν θέλεις
    // console.log("parabolic check:", { dstart, dend, Dtotal, ref, e, u0, u_circ, verySmallSpeed, closeToParabola });

    if (!verySmallSpeed && closeToParabola) {
      buildParabolicApprox(
        state,
        GM,
        TARGET_STEPS_BOUND,
        TARGET_PREVIEW_POINTS
      );
      return;
    }
  }

  // Κανονική περίπτωση: είτε κλειστή τροχιά που κλείνει,
  // είτε ανοικτή που ολοκληρώθηκε αριθμητικά.
  state.playIndex = 0;
  state.precomputed = true;

  // === Ζήτα ξαναχτίσιμο του cached Path2D για τη διακεκομμένη ===
  state.previewNeedsRedraw = true;

  // === Όριο ίχνους για τις κλειστές τροχιές (ίσο με μία περίοδο) ===
  if (state.isBound) {
    state.trailMaxBound = state.trajectory.length; // 1 πλήρης περίοδος
  } else {
    state.trailMaxBound = Infinity; // ανοικτές: δεν περιορίζουμε
  }

  if (state.trajectory.length > 0) {
    const n = state.trajectory.length;
    if (n > 0) {
      const first3 = state.trajectory.slice(0, Math.min(3, n));
      const last3 = state.trajectory.slice(Math.max(0, n - 3));

      console.log("=== trajectory debug (physics.js) ===");
      console.log("length:", n);
      console.log("first 3:", first3);
      console.log("last 3:", last3);
    } else {
      console.log("trajectory is empty (physics.js)");
    }
    const s0 = state.trajectory[0];
    state.r = { x: s0.x, y: s0.y };
    state.v = { x: s0.vx, y: s0.vy };
    state.a = accLocal(state.r);
    state.t = s0.t;
    state.path = [{ x: s0.x, y: s0.y }];
  }
}
