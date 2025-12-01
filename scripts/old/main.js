// main.js
import { createInitialState } from "./config.js";
import { draw } from "./draw.js";
import { initUI } from "./ui.js";
import {
  TRAIL_MAX_BOUND, // σταθερό μήκος πλήρους ουράς για κλειστές
  TRAIL_DRAW_MAX, // πόσα σημεία ζωγραφίζουμε
  TRAIL_RESAMPLE_STRIDE, // κάθε πόσα frames ξανα-δειγματοληπτούμε
} from "./config.js";

import { resetToInitial, autoFit, updateDerived } from "./orbitControl.js";

function downsampleUniform(points, maxN) {
  const n = points.length;
  if (n <= maxN) return points.slice(); // αντιγραφή για να μην κρατάμε reference
  const out = new Array(maxN);
  // κρατάμε ομοιόμορφα δείγματα ΚΑΙ το τελευταίο
  for (let i = 0; i < maxN; i++) {
    const idx = Math.round((i * (n - 1)) / (maxN - 1));
    out[i] = points[idx];
  }
  return out;
}

const canvas = document.querySelector("#cv");
const ctx = canvas.getContext("2d");

function screenToWorld(state, canvas, sx, sy) {
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;
  return {
    x: state.center.x + (sx - cx) / state.scale,
    y: state.center.y - (sy - cy) / state.scale,
  };
}

// ====== Zoom με ρόδα
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const oldScale = state.scale;
    const zoomFactor = Math.exp(-e.deltaY * 0.001); // ομαλό zoom
    const newScale = Math.min(20, Math.max(0.05, oldScale * zoomFactor));

    // κάνε zoom γύρω από τον δείκτη του ποντικιού
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const before = screenToWorld(state, canvas, mx, my);
    state.scale = newScale;
    const k = oldScale / newScale;
    state.center.x = before.x - (before.x - state.center.x) * k;
    state.center.y = before.y - (before.y - state.center.y) * k;
  },
  { passive: false }
);

// ====== Pan με drag (LMB)
let dragging = false;
let lastX = 0,
  lastY = 0;

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // μόνο αριστερό
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  // μετακίνησε το κέντρο σε world units
  state.center.x -= dx / state.scale;
  state.center.y += dy / state.scale;
});

window.addEventListener("mouseup", () => {
  dragging = false;
});

// ====== ΣΩΣΤΟ resizeCanvas (όπως παλιά)
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, rect.width * dpr);
  canvas.height = Math.max(400, rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ====== State
const state = createInitialState();

// Δέσιμο UI
initUI(state, {
  resetToInitial: () => resetToInitial(state),
  updateDerived: () => updateDerived(state),
  autoFit: () => autoFit(state, canvas),
  start: () => {
    // Πάντα βεβαιώσου ότι υπάρχει προϋπολογισμένη τροχιά.
    if (
      !state.precomputed ||
      !state.trajectory ||
      state.trajectory.length === 0
    ) {
      // ξαναϋπολόγισε με τα τρέχοντα M, r0, u
      updateDerived(state);
    }
    state.running = true;
  },
  pause: () => {
    state.running = false;
  },
});

// ΝΕΑ συνάρτηση: προχωράει την αναπαραγωγή της προϋπολογισμένης τροχιάς
function advancePlayback(state) {
  if (
    !state.precomputed ||
    !state.trajectory ||
    state.trajectory.length === 0
  ) {
    return;
  }

  const base = Math.floor(state.speed || 1);
  const steps = Math.max(1, Math.min(base * 10, 200)); // ΠΟΤΕ πάνω από 200 steps/frame
  const crashR = 6;

  for (let i = 0; i < steps; i++) {
    if (state.playIndex >= state.trajectory.length) {
      if (state.isBound) {
        state.playIndex = 0;
        continue; // <-- άφησέ το αν είσαι ΜΕΣΑ σε loop
      } else {
        state.running = false;
        break;
      }
    }

    const s = state.trajectory[state.playIndex];
    const rmag = Math.hypot(s.x, s.y);
    if (rmag < crashR && state.stopOnCrash) {
      state.running = false;
      break;
    }

    state.r = { x: s.x, y: s.y };
    state.v = { x: s.vx, y: s.vy };
    state.t = s.t;
    state.path.push({ x: s.x, y: s.y });

    // === ΣΤΑΘΕΡΟ ΜΗΚΟΣ ΟΥΡΑΣ για κλειστές τροχιές + downsampling για ζωγραφική ===

    // 1) Περιορισμός συνολικού μήκους ουράς σε «μία περίοδο» (ή στο όριο που έχεις ορίσει)
    if (state.isBound && Number.isFinite(state.trailMaxBound)) {
      const max = state.trailMaxBound;
      if (state.path.length > max) {
        state.path.splice(0, state.path.length - max);
      }
    }

    // 2) Downsampling για να μη «σερνεται» το draw όταν τα σημεία γίνουν πάρα πολλά.
    //    Κρατάμε πλήρη ουρά στο state.path, ΑΛΛΑ δημιουργούμε/συντηρούμε μια ελαφριά εκδοχή για ζωγραφική.
    //
    //    - TRAIL_DRAW_MAX: πόσα σημεία (max) θα ζωγραφίζουμε.
    //    - TRAIL_RESAMPLE_STRIDE: κάθε πόσα frames θα ξανα-δειγματοληπτούμε.
    //    - Κρατάμε μόνο τα ΤΕΛΕΥΤΑΙΑ trailMaxBound σημεία για sampling.
    if (!state._trailFrameCount) state._trailFrameCount = 0;
    state._trailFrameCount++;

    const drawMax =
      typeof TRAIL_DRAW_MAX !== "undefined" ? TRAIL_DRAW_MAX : 1500;
    const resampleEvery =
      typeof TRAIL_RESAMPLE_STRIDE !== "undefined" ? TRAIL_RESAMPLE_STRIDE : 8;

    // Φτιάξε «παράθυρο» των τελευταίων σημείων ίσου μήκους με την ουρά που θες να φαίνεται
    let windowStart = 0;
    if (
      Number.isFinite(state.trailMaxBound) &&
      state.path.length > state.trailMaxBound
    ) {
      windowStart = state.path.length - state.trailMaxBound;
    }
    const windowed = state.path.slice(windowStart);

    // Μόνο αν ήρθε η ώρα (stride) ή αν η «ζωγραφίσιμη» ουρά λείπει/είναι μικρή
    if (
      state._trailFrameCount % resampleEvery === 0 ||
      !state.pathForDraw ||
      state.pathForDraw.length < Math.min(windowed.length, drawMax * 0.5)
    ) {
      // Ομοιόμορφο δειγματοληπτικό downsample που κρατά ΠΑΝΤΑ το τελευταίο σημείο
      const n = windowed.length;
      if (n <= drawMax) {
        state.pathForDraw = windowed.slice();
      } else {
        const out = new Array(drawMax);
        for (let i = 0; i < drawMax; i++) {
          const idx = Math.round((i * (n - 1)) / (drawMax - 1));
          out[i] = windowed[idx];
        }
        state.pathForDraw = out;
      }
    }

    state.playIndex++;
  }
}

// Loop
function loop() {
  if (state.running) {
    advancePlayback(state);
  }
  draw(ctx, canvas, state);
  requestAnimationFrame(loop);
}

resetToInitial(state);
updateDerived(state); // αυτό ΜΕΣΑ του καλεί precomputeTrajectory
draw(ctx, canvas, state);
requestAnimationFrame(loop);
