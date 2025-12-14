// main.js
import { createInitialState } from "./config.js";
import { draw } from "./draw.js";
import { initUI, updateOrbitUI } from "./ui.js";
import {
  TRAIL_MAX_BOUND,
  TRAIL_DRAW_MAX,
  TRAIL_RESAMPLE_STRIDE,
  DT_FIXED,
  CRASH_R,
} from "./config.js";

import { keplerStep, acc, computeOrbitParams, computePreviewFromRV } from "./physics.js";
import { resetToInitial, updateDerived } from "./orbitControl.js";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatPeriodSup(Tsec) {
  if (!Number.isFinite(Tsec)) return "—";
  let t = Math.max(0, Math.floor(Tsec));
  const h = Math.floor(t / 3600);
  t -= h * 3600;
  const m = Math.floor(t / 60);
  const s = t - m * 60;

  const mm = m.toString().padStart(2, "0");
  const ss = Math.floor(s).toString().padStart(2, "0");

  return `${h}<span class="unit-sup">h</span> ${mm}<span class="unit-sup">m</span> ${ss}<span class="unit-sup">s</span>`;
}

// ΝΕΟ: charts
import {
  initCharts,
  resetEnergySeries,
  addEnergySample,
  resizeCharts,
  ensureChart,
  setImpactTime,
  clearImpactTimes,
} from "./charts.js";

let lastTimestamp = null;

const canvas = document.querySelector("#cv");
const ctx = canvas.getContext("2d");


// ===== Fullscreen toggle (κουμπί αριστερά από Language) =====
const fsBtn = document.getElementById("fsBtn");
const fsIcon = document.getElementById("fsIcon");

function isFullscreen() {
  return !!document.fullscreenElement;
}

async function toggleFullscreen() {
  try {
    if (!isFullscreen()) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.warn("Fullscreen toggle failed:", err);
  }
}

function syncFullscreenUI() {
  if (!fsBtn) return;
  const on = isFullscreen();
  fsBtn.classList.toggle("on", on);

  // Αν έχεις 2 icons, βάλε τα ονόματα εδώ.
  // (Μπορείς να τα μετονομάσεις στο scripts/img ανάλογα.)
  if (fsIcon) {
    fsIcon.src = on
      ? "scripts/img/fullscreen-exit.png"
      : "scripts/img/fullscreen-enter.png";
  }
}

if (fsBtn) {
  fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenUI);
  syncFullscreenUI();
}


// ====== State (πρέπει να υπάρχει πριν από listeners)
const state = createInitialState();

// Snapshot of the initial "DART mission" numeric defaults from the DOM.
// (Important: HTML defaults may differ from createInitialState(), e.g. speed is 1000 in the UI.)
const DART_NUM_DEFAULTS = (() => {
  const num = (id) => {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return Number.isFinite(v) ? v : NaN;
  };

  const gm = num("gmNum"); // units: ×1e11 kg
  const sm = num("smallmNum"); // units: ×1e9 kg
  const r0 = num("r0Num"); // m
  const u = num("uNum"); // m/s
  const speed = num("speedNum"); // unitless
  const mD = num("mDNum"); // kg
  const uD = num("uDNum"); // m/s

  return {
    M: Number.isFinite(gm) ? gm * 1e11 : 5.4e11,
    m: Number.isFinite(sm) ? sm * 1e9 : 1.3e9,
    r0: Number.isFinite(r0) ? r0 : 1190,
    u: Number.isFinite(u) ? u : 0.17403,
    speed: Number.isFinite(speed) ? speed : 1000,
    mD: Number.isFinite(mD) ? mD : 580,
    uD: Number.isFinite(uD) ? uD : 6150,
  };
})();
function screenToWorld(state, canvas, sx, sy) {
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;
  return {
    x: state.center.x + (sx - cx) / state.scale,
    y: state.center.y - (sy - cy) / state.scale,
  };
}
function worldToScreen(state, canvas, x, y) {
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;
  return {
    x: cx + (x - state.center.x) * state.scale,
    y: cy - (y - state.center.y) * state.scale,
  };
}

function positionMeasureTool() {
  if (!state.measureTool) return;

  const w = canvas.clientWidth;
  const yPx = Math.max(35, Math.min(70, canvas.clientHeight * 0.12)); // "πάνω μέρος"
  const lenPx = Math.max(80, w * 0.2); // ~1/5 του πλάτους
  const cxPx = w / 2;

  const p1w = screenToWorld(state, canvas, cxPx - lenPx / 2, yPx);
  const p2w = screenToWorld(state, canvas, cxPx + lenPx / 2, yPx);

  state.measureTool.p1.x = p1w.x;
  state.measureTool.p1.y = p1w.y;
  state.measureTool.p2.x = p2w.x;
  state.measureTool.p2.y = p2w.y;
}


function restoreDefaultsAll() {
  // Restore DART mission values:
  // - επαναφέρει ΜΟΝΟ τα αριθμητικά (sliders/inputs)
  // - ΔΕΝ αλλάζει checkboxes (ούτε τα state flags που αντιστοιχούν σε αυτά)
  // - καθαρίζει ίχνη από Impacts (διακεκομμένες ιστορικές + markers) και επαναφέρει την τροχιά στα defaults

  // pause / reset clock for the animation loop
  state.running = false;
  lastTimestamp = null;

  // 1) numeric defaults into state
  state.M = DART_NUM_DEFAULTS.M;
  state.m = DART_NUM_DEFAULTS.m;
  state.r0 = DART_NUM_DEFAULTS.r0;
  state.u = DART_NUM_DEFAULTS.u;
  state.speed = DART_NUM_DEFAULTS.speed;
  state.mD = DART_NUM_DEFAULTS.mD;
  state.uD = DART_NUM_DEFAULTS.uD;

  // 2) sync ONLY numeric UI controls (no checkbox touching)
  const setPair = (rangeId, numId, value) => {
    const r = document.getElementById(rangeId);
    const n = document.getElementById(numId);
    if (r) r.value = String(value);
    if (n) n.value = String(value);
  };

  setPair("gmRange", "gmNum", (state.M / 1e11));
  setPair("smallmRange", "smallmNum", (state.m / 1e9));
  setPair("r0Range", "r0Num", state.r0);
  setPair("uRange", "uNum", state.u);
  setPair("speedRange", "speedNum", state.speed);
  setPair("mDRange", "mDNum", state.mD);
  setPair("uDRange", "uDNum", state.uD);

  // 3) clear impact-generated visuals/history
  state.previewHistory = [];
  state.impactAlpha = 0;
  state.impactX = 0;
  state.impactY = 0;

  if (typeof clearImpactTimes === "function") {
    clearImpactTimes();
  }

  // 4) reset orbit bodies + trail to defaults (does NOT touch checkboxes)
  resetToInitial(state); // recomputes previewPath + resets r,v,path,time

  // 5) reset charts series (keeps chart visibility checkboxes as-is)
  resetEnergySeries(state);

  // redraw once
  draw(ctx, canvas, state);
}


function pickMeasureHandle(sx, sy) {
  if (!state.showMeasure || !state.measureTool) return null;
  const p1 = state.measureTool.p1;
  const p2 = state.measureTool.p2;
  if (!p1 || !p2) return null;

  const rHit = 10; // px
  const s1 = worldToScreen(state, canvas, p1.x, p1.y);
  const s2 = worldToScreen(state, canvas, p2.x, p2.y);

  const d1 = Math.hypot(sx - s1.x, sy - s1.y);
  if (d1 <= rHit) return "p1";
  const d2 = Math.hypot(sx - s2.x, sy - s2.y);
  if (d2 <= rHit) return "p2";
  return null;
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

    // === DEBUG: log του zoom scale με min/max ===
    /*if (!window._zoomStats) {
      window._zoomStats = { min: newScale, max: newScale };
    } else {
      window._zoomStats.min = Math.min(window._zoomStats.min, newScale);
      window._zoomStats.max = Math.max(window._zoomStats.max, newScale);
    }
    console.log(
      "[ZOOM] scale =",
      newScale.toFixed(4),
      " | min =",
      window._zoomStats.min.toFixed(4),
      " | max =",
      window._zoomStats.max.toFixed(4)
    );*/
  },
  { passive: false }
);

// ====== Pan με drag (LMB)
let dragging = false;
let measureDragging = false;
let measureWhich = null;
let measureOffX = 0;
let measureOffY = 0;

let lastX = 0,
  lastY = 0;

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // μόνο αριστερό

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // 1) Αν πατήσαμε πάνω σε σημείο του εργαλείου μέτρησης → drag σημείου (όχι pan)
  const hit = pickMeasureHandle(mx, my);
  if (hit) {
    measureDragging = true;
    measureWhich = hit;

    const mw = screenToWorld(state, canvas, mx, my);
    const p = state.measureTool?.[hit];
    if (p) {
      measureOffX = p.x - mw.x;
      measureOffY = p.y - mw.y;
    } else {
      measureOffX = 0;
      measureOffY = 0;
    }

    canvas.style.cursor = "grabbing";
    return;
  }

  // 2) Αλλιώς pan κανονικά
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});



window.addEventListener("mousemove", (e) => {
  // ====== Drag σημείου μέτρησης
  if (measureDragging && measureWhich && state.showMeasure && state.measureTool) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const mw = screenToWorld(state, canvas, mx, my);
    const p = state.measureTool[measureWhich];
    if (p) {
      p.x = mw.x + measureOffX;
      p.y = mw.y + measureOffY;
    }

    canvas.style.cursor = "grabbing";
    return;
  }

  // ====== Pan με drag
  if (dragging) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // μετακίνησε το κέντρο σε world units
    state.center.x -= dx / state.scale;
    state.center.y += dy / state.scale;
    return;
  }

  // ====== Hover cursor πάνω στα σημεία (χεράκι)
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const over = mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height;

  if (over && state.showMeasure) {
    const hit = pickMeasureHandle(mx, my);
    canvas.style.cursor = hit ? "grab" : "default";
  } else {
    canvas.style.cursor = "default";
  }
});



window.addEventListener("mouseup", () => {
  dragging = false;
  measureDragging = false;
  measureWhich = null;
});



// ====== ΣΩΣΤΟ resizeCanvas (όπως παλιά)
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Κρίσιμο: το internal buffer ΠΡΕΠΕΙ να ταιριάζει 1:1 με το CSS μέγεθος,
  // αλλιώς ο browser κάνει stretch και "παραμορφώνει" (ellipse αντί για circle κλπ.)
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  // Ζωγραφίζουμε σε CSS pixels (το dpr το αναλαμβάνει το transform)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // προσαρμογή και των γραφημάτων
  resizeCharts();

  // άμεσο redraw για να μην μείνει "παλιό" καρέ μετά το resize
  if (state && state.r && Number.isFinite(state.r.x) && Number.isFinite(state.r.y)) {
    draw(ctx, canvas, state);
  }
}


// ===== Charts: ορατότητα με checkboxes =====
let syncChartsVisibility = () => {};

function setupChartToggles() {
  const defs = [
    { cb: "chartShowE", card: "cardEnergyE", kind: "E" },
    { cb: "chartShowK", card: "cardEnergyK", kind: "K" },
    { cb: "chartShowU", card: "cardEnergyU", kind: "U" },
    { cb: "chartShowR", card: "cardRadius", kind: "R" },
    { cb: "chartShowV", card: "cardVelocity", kind: "V" },
    { cb: "chartShowL", card: "cardBrightness", kind: "L" },
  ];

  function sync() {
    for (const d of defs) {
      const cb = document.getElementById(d.cb);
      const card = document.getElementById(d.card);
      if (!cb || !card) continue;

      const show = !!cb.checked;
      card.style.display = show ? "" : "none";

      if (show) {
        // δημιουργεί το αντίστοιχο γράφημα (αν δεν υπάρχει)
        ensureChart(d.kind);
      }
    }

    // resize αφού εφαρμοστεί το display
    setTimeout(() => resizeCharts(), 60);
  }

  // listeners
  for (const d of defs) {
    const cb = document.getElementById(d.cb);
    if (cb) cb.addEventListener("change", sync);
  }

  syncChartsVisibility = sync;
  sync();
}

setupChartToggles();

// Συγχρονισμός αρχικών τιμών state με τα default του UI
const r0Input = document.getElementById("r0Num");
if (r0Input) {
  const v = parseFloat(r0Input.value);
  if (!Number.isNaN(v)) state.r0 = v;
}

const uInput = document.getElementById("uNum");
if (uInput) {
  const v = parseFloat(uInput.value);
  if (!Number.isNaN(v)) state.u = v;
}

const gmInput = document.getElementById("gmNum");
if (gmInput) {
  const v = parseFloat(gmInput.value);
  if (!Number.isNaN(v)) state.M = v * 1e11;
}

const smallmInput = document.getElementById("smallmNum");
if (smallmInput) {
  const v = parseFloat(smallmInput.value);
  if (!Number.isNaN(v)) state.m = v * 1e9;
}

const speedInput = document.getElementById("speedNum");
if (speedInput) {
  const v = parseFloat(speedInput.value);
  if (!Number.isNaN(v)) state.speed = v;
}

const mDInput = document.getElementById("mDNum");
if (mDInput) {
  const v = parseFloat(mDInput.value);
  if (!Number.isNaN(v)) state.mD = v;
}

const uDInput = document.getElementById("uDNum");
if (uDInput) {
  const v = parseFloat(uDInput.value);
  if (!Number.isNaN(v)) state.uD = v;
}

// Δέσιμο UI
initUI(state, {
  resetToInitial: () => {
    resetToInitial(state);
    state.time = 0;
    resetEnergySeries(state); // ΜΟΝΟ εδώ θέλουμε full reset γραφήματος
  },
  updateDerived: () => {
    updateDerived(state);
    resetEnergySeries(state); // ΟΚ όταν αλλάζεις r0/u κλπ
  },
  restoreDefaults: () => restoreDefaultsAll(),
  start: () => {
    if (!state.precomputed) {
      updateDerived(state);
      resetEnergySeries(state); // ΜΟΝΟ στην ΠΡΩΤΗ εκκίνηση αν θες
    }
    lastTimestamp = null;
    if (!Number.isFinite(state.time)) state.time = 0;
    state.running = true; // ΚΑΜΙΑ κλήση σε resetEnergySeries εδώ
  },
  pause: () => {
    state.running = false;
  },
  impact: () => {
    applyImpact(state);
  },
  positionMeasureTool: () => {
    positionMeasureTool();
  },

    clearImpactTimes,
});

// ===== Αυτόματη παύση όταν χαθεί η εστίαση =====
function autoPause() {
  if (state.running) {
    state.running = false;
  }
}

// Όταν το tab γίνει hidden (άλλο tab, minimize κλπ)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    autoPause();
  }
});

// Προαιρετικά: pause και σε blur του παραθύρου
window.addEventListener("blur", () => {
  autoPause();
});

function applyImpact(state) {
  // κράτα τη διακεκομμένη τροχιά πριν από το Impact
  if (state.showPreview !== false && Array.isArray(state.previewPath) && state.previewPath.length >= 2) {
    if (!Array.isArray(state.previewHistory)) state.previewHistory = [];
    // deep-ish clone των σημείων
    state.previewHistory.push(state.previewPath.map(p => ({ x: p.x, y: p.y })));
    // κράτα μόνο τις τελευταίες 6
    if (state.previewHistory.length > 6) state.previewHistory.shift();
  }
  const m = state.m;
  const mD = state.mD;
  const uD = state.uD;

  // έλεγχος εγκυρότητας
  if (!Number.isFinite(m) || !Number.isFinite(mD) || m <= 0 || mD <= 0) {
    return;
  }

  const vx = state.v.x || 0;
  const vy = state.v.y || 0;
  const vmag = Math.hypot(vx, vy);

  // αν η ταχύτητα είναι σχεδόν μηδέν, δεν ορίζεται διεύθυνση → δεν κάνουμε κρούση
  if (vmag < 1e-8) {
    return;
  }

  // μοναδιαίο διάνυσμα διεύθυνσης ταχύτητας του δορυφόρου (prograde)
  const tx = vx / vmag;
  const ty = vy / vmag;

  // ταχύτητα διαστημοπλοίου: head-on, αντίθετη διεύθυνση από τον δορυφόρο
  const vDx = -uD * tx;
  const vDy = -uD * ty;

  // πλήρως πλαστική κρούση: νέο σώμα με μάζα m + mD
  const newMass = m + mD;

  const newVx = (m * vx + mD * vDx) / newMass;
  const newVy = (m * vy + mD * vDy) / newMass;

  // ενημέρωση κατάστασης δορυφόρου
  state.m = newMass; // νέα μάζα μετά τη συγκόλληση
  state.v = { x: newVx, y: newVy }; // νέα ταχύτητα
  state.a = acc(state, state.r); // νέα επιτάχυνση στο ίδιο σημείο

  // μετά τη σύγκρουση η αρχική Kepler τροχιά ΔΕΝ ισχύει πια
  state.kepler = null;
  // ===== Νέα τροχιά μετά τη σύγκρουση (μόνο για το panel, ΟΧΙ για τους δρομείς) =====
  const rmag = Math.hypot(state.r.x, state.r.y);
  const vmagNew = Math.hypot(newVx, newVy);

  // Φτιάχνουμε προσωρινό state για τον υπολογισμό E, e, T
  const tmpState = { ...state, r0: rmag, u: vmagNew };
  const { E, uc, ue, e, type, pillClass, Tsec } = computeOrbitParams(tmpState);

  // Τύπος τροχιάς
  const orbitTypeEl = document.querySelector("#orbitType");
  if (orbitTypeEl) {
    orbitTypeEl.setAttribute("data-i18n-dyn", type);

    const label =
      typeof window !== "undefined" &&
      window.I18N &&
      typeof window.I18N.t === "function"
        ? window.I18N.t(type)
        : type;

    orbitTypeEl.textContent = label;
    orbitTypeEl.className = "pill " + pillClass;
  }

  // u_circ, u_esc, E, e
  setText("uCirc", Number.isFinite(uc) ? uc.toFixed(2) + " m/s" : "—");
  setText("uEsc", Number.isFinite(ue) ? ue.toFixed(2) + " m/s" : "—");
  setText("energy", Number.isFinite(E) ? E.toFixed(3) + " J/kg" : "—");
  setText("ecc", Number.isFinite(e) ? e.toFixed(2) : "—");

  // Περίοδος
  const periodEl = document.querySelector("#periodFmt");
  if (periodEl) {
    periodEl.innerHTML = formatPeriodSup(Tsec);
  }

  // ===== ΝΕΑ διακεκομμένη τροχιά μετά το Impact =====
  {
    const res = computePreviewFromRV(state, state.r, state.v);
    if (res && Array.isArray(res.previewPath)) state.previewPath = res.previewPath;
    state.ellipseGeom = res ? res.ellipseGeom : null;
  }

  // ===== ΕΦΕ ΣΥΓΚΡΟΥΣΗΣ =====
  state.impactAlpha = 1;
  state.impactX = state.r.x;
  state.impactY = state.r.y;
  state.impactDirX = -tx;
  state.impactDirY = -ty;
  // Chart marker: χρόνος κρούσης (ώρες)
  setImpactTime((state.time || 0) / 3600);
}

function advancePlayback(state, deltaSec) {
  if (!state.precomputed) return;

  const base = state.speed || 1;
  const speedFactor = Math.max(0.1, base);
  let dt = deltaSec * speedFactor;

  // προαιρετικό "κόφτης" για να μη ξεφύγει αν κολλήσει κάποιο frame
  const MAX_DT = 5000;
  if (dt > MAX_DT) dt = MAX_DT;
  // === ΔΥΝΑΜΙΚΗ ΑΚΤΙΝΑ ΣΥΓΚΡΟΥΣΗΣ ΑΠΟ ΤΗ ΜΑΖΑ Μ ===
  // Πυκνότητα ρ = 2.4 g/cm^3 = 2400 kg/m^3
  const BODY_DENSITY = 2400;
  const BASE_CRASH_R = CRASH_R;

  {
    const M = state.M;
    if (Number.isFinite(M) && M > 0) {
      // ακτίνα σφαίρας: R = (3M / (4πρ))^(1/3)
      state.crashR = Math.cbrt((3 * M) / (4 * Math.PI * BODY_DENSITY));
    } else {
      state.crashR = BASE_CRASH_R;
    }
  }
const crashR = state.crashR || BASE_CRASH_R;

  if (state.kepler) {
    // ===== ΚΛΕΙΣΤΗ ΤΡΟΧΙΑ: Kepler =====
    keplerStep(state, dt);

    const rmag = Math.hypot(state.r.x, state.r.y);
    if (rmag < crashR && state.stopOnCrash) {
      state.running = false;
      return;
    }
  } else {
    // ===== ΑΝΟΙΚΤΗ ΤΡΟΧΙΑ / ΠΤΩΣΗ: numeric integration (Velocity Verlet) =====
    const r = state.r;
    const v = state.v;
    const a = state.a || acc(state, r);

    // 1) νέο r
    const rx = r.x + v.x * dt + 0.5 * a.x * dt * dt;
    const ry = r.y + v.y * dt + 0.5 * a.y * dt * dt;
    const rNew = { x: rx, y: ry };

    // 2) νέα επιτάχυνση
    const aNew = acc(state, rNew);

    // 3) νέο v
    const vx = v.x + 0.5 * (a.x + aNew.x) * dt;
    const vy = v.y + 0.5 * (a.y + aNew.y) * dt;
    const vNew = { x: vx, y: vy };

    const rmag = Math.hypot(rx, ry);
    if (rmag < crashR && state.stopOnCrash) {
      state.running = false;
      return;
    }

    state.r = rNew;
    state.v = vNew;
    state.a = aNew;
    state.t = (state.t || 0) + dt;
    state.time = (state.time || 0) + dt;
  }
  // ΝΕΟ: ενημέρωση γραφήματος ενέργειας για ΟΛΕΣ τις τροχιές
  addEnergySample(state, dt);
  // === κοινό κομμάτι ουράς για κλειστές & ανοικτές ===
  state.path.push({ x: state.r.x, y: state.r.y });

  if (Number.isFinite(state.trailMaxBound)) {
    const max = state.trailMaxBound;
    if (state.path.length > max) {
      state.path.splice(0, state.path.length - max);
    }
  }

  if (!state._trailFrameCount) state._trailFrameCount = 0;
  state._trailFrameCount++;

  const drawMax = typeof TRAIL_DRAW_MAX !== "undefined" ? TRAIL_DRAW_MAX : 1500;
  const resampleEvery =
    typeof TRAIL_RESAMPLE_STRIDE !== "undefined" ? TRAIL_RESAMPLE_STRIDE : 8;

  let windowStart = 0;
  if (
    Number.isFinite(state.trailMaxBound) &&
    state.path.length > state.trailMaxBound
  ) {
    windowStart = state.path.length - state.trailMaxBound;
  }
  const windowed = state.path.slice(windowStart);

  if (
    state._trailFrameCount % resampleEvery === 0 ||
    !state.pathForDraw ||
    state.pathForDraw.length < Math.min(windowed.length, drawMax * 0.5)
  ) {
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
}

// Loop
function loop(timestamp) {
  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
  }
  const deltaMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // μετατροπή σε δευτερόλεπτα
  const deltaSec = deltaMs / 1000;

  if (state.running) {
    advancePlayback(state, deltaSec);
  }
  const timeEl = document.getElementById("orbitTime");
  if (timeEl) {
    timeEl.innerHTML = formatPeriodSup(state.time || 0);
  }

  // Δυναμική απόσταση M–m
  const distEl = document.getElementById("distRM");
  if (distEl && state.r) {
    const rx = state.r.x;
    const ry = state.r.y;
    const rmag = Math.hypot(rx, ry);
    distEl.textContent = Number.isFinite(rmag) ? rmag.toFixed(1) + " m" : "—";
  }

  draw(ctx, canvas, state);
  requestAnimationFrame(loop);
}

resetToInitial(state);
updateDerived(state); // αυτό ΜΕΣΑ του καλεί precomputeTrajectory


initCharts(state);

// ====== Resize (after state + charts are initialized) ======
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

resetEnergySeries(state);
draw(ctx, canvas, state);
requestAnimationFrame(loop);