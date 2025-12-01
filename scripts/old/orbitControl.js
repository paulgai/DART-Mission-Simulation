// orbitControl.js
import { acc, precomputeTrajectory } from "./physics.js";
import { updateOrbitUI, $ } from "./ui.js";

export function resetToInitial(state) {
  // όταν έχουμε ήδη precomputed τροχιά, απλώς ξαναπάμε στην αρχή
  if (state.trajectory && state.trajectory.length > 0) {
    state.playIndex = 0;
    const s0 = state.trajectory[0];
    state.r = { x: s0.x, y: s0.y };
    state.v = { x: s0.vx, y: s0.vy };
    state.a = acc(state, state.r);
    state.t = s0.t;
    state.path = [{ x: s0.x, y: s0.y }];
  } else {
    // fallback αν δεν έχει γίνει ακόμα precompute
    state.r = { x: state.r0, y: 0 };
    state.v = { x: 0, y: state.u };
    state.a = acc(state, state.r);
    state.t = 0;
    state.path = [{ x: state.r.x, y: state.r.y }];
  }
}

export function autoFit(state, canvas) {
  const src =
    state.previewPath && state.previewPath.length
      ? state.previewPath
      : state.path && state.path.length
      ? state.path
      : [{ x: state.r0, y: 0 }];

  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  for (const p of src) {
    if (!p) continue;
    if (p.x < minx) minx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.x > maxx) maxx = p.x;
    if (p.y > maxy) maxy = p.y;
  }

  minx = Math.min(minx, -10);
  miny = Math.min(miny, -10);
  maxx = Math.max(maxx, 10);
  maxy = Math.max(maxy, 10);

  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  const spanx = maxx - minx,
    spany = maxy - miny;
  const margin = 40;

  const sx = (w - 2 * margin) / (spanx || 1);
  const sy = (h - 2 * margin) / (spany || 1);
  state.scale = Math.max(0.1, Math.min(sx, sy));

  // ΝΕΟ: κεντράρισμα περιοχής
  state.center = { x: (minx + maxx) / 2, y: (miny + maxy) / 2 };
}

export function updateDerived(state) {
  // 1) ξαναϋπολόγισε την τροχιά/preview
  precomputeTrajectory(state);

  // 2) (προαιρετικό αλλά βοηθάει) καθάρισε τυχόν cache διακεκομμένης
  //    ώστε να ζωγραφιστεί σίγουρα το νέο preview στην επόμενη draw
  state._previewCache = null;

  // 3) ανανέωσε labels (τύπος τροχιάς, uc, ue, E, e, περίοδος)
  updateOrbitUI(state);
}
