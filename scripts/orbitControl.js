// orbitControl.js
import { acc, precomputeTrajectory } from "./physics.js";
import { updateOrbitUI, $ } from "./ui.js";

export function resetToInitial(state) {
  precomputeTrajectory(state);
  updateOrbitUI(state);

  // σταματάμε την κίνηση
  state.running = false;

  // αν έχουμε Kepler στοιχεία, γυρνάμε στην αρχική θέση r0,u0 από εκεί
  if (state.kepler) {
    state.time = 0;
    const { r0, u0 } = state.kepler;

    state.r = { x: r0, y: 0 };
    state.v = { x: 0, y: u0 };
  } else {
    // fallback: χωρίς Kepler, χρησιμοποιούμε τις παραμέτρους του UI
    state.time = 0;
    state.r = { x: state.r0, y: 0 };
    state.v = { x: 0, y: state.u };
  }

  // ανανέωση επιτάχυνσης και χρόνου
  state.a = acc(state, state.r);
  state.t = 0;
  state.playIndex = 0;

  // === ΚΑΘΑΡΙΣΜΟΣ ΤΡΟΧΙΑΣ / ΟΥΡΑΣ ===
  // καθαρίζουμε όλη την ουρά και το downsample για το draw
  state.path = [{ x: state.r.x, y: state.r.y }]; // ξεκινά από την αρχική θέση
  state.pathForDraw = null;

  // ΔΕΝ πειράζουμε το previewPath: η γεωμετρική τροχιά (έλλειψη / υπερβολή)
  // μένει στην οθόνη, απλά εξαφανίζεται το ίχνος της κίνησης.
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
