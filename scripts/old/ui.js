// ui.js
// Σύνδεση των controls (sliders, κουμπιά, checkboxes) με το state
// + ενημέρωση του UI για τον τύπο τροχιάς κλπ.

import { computeOrbitParams } from "./physics.js";

const setText = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

export const $ = (sel) => document.querySelector(sel);
const fmt = (x, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : "—");
const fmtExp = (x) => {
  if (!Number.isFinite(x)) return "—";
  const e = x.toExponential(2); // π.χ. 5.00e+11
  const [mant, pow] = e.split("e");
  return `${mant}×10^${parseInt(pow, 10)}`;
};

/**
 * Δένει όλα τα controls του HTML με το state.
 *
 * @param {object} state - το αντικείμενο κατάστασης της προσομοίωσης
 * @param {object} callbacks - συναρτήσεις που παρέχει το main.js:
 *    {
 *      resetToInitial: () => void,
 *      updateDerived: () => void,
 *      restoreDefaults: () => void,
 *      start: () => void,
 *      pause: () => void,
 *    }
 */
export function initUI(state, callbacks) {
  const showImagesEl = $("#showImages");
  if (showImagesEl) {
    showImagesEl.addEventListener("change", (e) => {
      state.showBodyImages = e.target.checked;
    });
}

  function bindPair(rangeId, numId, key, onChange) {
    const r = $(rangeId);
    const n = $(numId);
    const sync = (from, to) => {
      to.value = from.value;
    };
    r.addEventListener("input", () => {
      sync(r, n);
      state[key] = parseFloat(r.value);
      onChange && onChange();
    });
    n.addEventListener("input", () => {
      sync(n, r);
      state[key] = parseFloat(n.value);
      onChange && onChange();
    });
  }

  // Μάζα M
  (function () {
    const r = $("#gmRange"),
      n = $("#gmNum");
    const apply = () => {
      const factor = parseFloat(r.value);
      n.value = factor;
      state.M = factor * 1e11;
      state.running = false;
      callbacks.resetToInitial();
      callbacks.updateDerived();
    };
    r.addEventListener("input", apply);
    n.addEventListener("input", () => {
      r.value = n.value;
      apply();
    });
  })();

  (function () {
    const r = $("#smallmRange"),
      n = $("#smallmNum");
    const apply = () => {
      const factor = parseFloat(r.value);
      n.value = factor;
      state.m = factor * 1e9;
      state.running = false;
      callbacks.resetToInitial();
      callbacks.updateDerived();
    };
    r.addEventListener("input", apply);
    n.addEventListener("input", () => {
      r.value = n.value;
      apply();
    });
  })();

  // Αρχική απόσταση r0
  bindPair("#r0Range", "#r0Num", "r0", () => {
    state.running = false;
    callbacks.resetToInitial();
    callbacks.updateDerived();
  });

  // Αρχική ταχύτητα u
  bindPair("#uRange", "#uNum", "u", () => {
    state.running = false;
    callbacks.resetToInitial();
    callbacks.updateDerived();
  });

  bindPair("#speedRange", "#speedNum", "speed");

  // Μάζα διαστημοπλοίου m_D
  bindPair("#mDRange", "#mDNum", "mD");

  // Ταχύτητα διαστημοπλοίου u_D
  bindPair("#uDRange", "#uDNum", "uD");

  $("#gridOn").addEventListener(
    "change",
    (e) => (state.showGrid = e.target.checked)
  );
  $("#showVel").addEventListener(
    "change",
    (e) => (state.showVel = e.target.checked)
  );
  $("#showDistance").addEventListener(
    "change",
    (e) => (state.showDistance = e.target.checked)
  );

  // Εργαλείο μέτρησης (ruler)
  const _measureCb = $("#showMeasure");
  if (_measureCb) {
    _measureCb.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      state.showMeasure = on;
      // Κάθε φορά που ενεργοποιείται, τοποθέτησέ το στην κορυφή/κέντρο του canvas
      if (on && callbacks.positionMeasureTool) {
        callbacks.positionMeasureTool();
      }
    });
  }
  $("#showForces").addEventListener(
    "change",
    (e) => (state.showForces = e.target.checked)
  );
  $("#showPreview").addEventListener(
    "change",
    (e) => (state.showPreview = e.target.checked)
  );
  $("#showTrail").addEventListener(
    "change",
    (e) => (state.showTrail = e.target.checked)
  );
  $("#showClosedGeom").addEventListener(
    "change",
    (e) => (state.showClosedGeom = e.target.checked)
  );

  // Κουμπιά
  $("#playBtn").addEventListener("click", () => {
    callbacks.start();
  });
  $("#pauseBtn").addEventListener("click", () => {
    callbacks.pause();
  });
  $("#resetBtn").addEventListener("click", () => {
    callbacks.pause();

    // ΝΕΟ: με reset να καθαρίζουν τα "ίχνη" από παλαιότερα impacts
    // (π.χ. παλιές διακεκομμένες τροχιές / markers στα γραφήματα)
    if (state.previewHistory) state.previewHistory = [];
    if (typeof callbacks.clearImpactTimes === "function") {
      callbacks.clearImpactTimes();
    }

    callbacks.resetToInitial();
    callbacks.updateDerived();
  });
  $("#clearBtn").addEventListener("click", () => {
    // καθάρισε την πραγματική τροχιά, αλλά άφησε την προβλεπόμενη
    state.path = [];
  });
  $("#fitBtn").addEventListener("click", () => {
    if (callbacks.restoreDefaults) callbacks.restoreDefaults();
  });
$("#impactBtn").addEventListener("click", () => {
    if (callbacks.impact) {
      callbacks.impact();
    }
  });
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

/**
 * Ενημερώνει τα UI στοιχεία που δείχνουν:
 * - τύπο τροχιάς
 * - u_circ, u_esc
 * - ενέργεια E
 * - εκκεντρότητα e
 * και προσαρμόζει τα όρια του slider u.
 */
export function updateOrbitUI(state) {
  const { E, uc, ue, e, type, pillClass, Tsec } = computeOrbitParams(state);
  // Τύπος τροχιάς
  const orbitTypeEl = $("#orbitType");
  if (orbitTypeEl) {
    // αποθηκεύουμε το key για δυναμική μετάφραση
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

  setText("uCirc", Number.isFinite(uc) ? uc.toFixed(2) + " m/s" : "—");
  setText("uEsc", Number.isFinite(ue) ? ue.toFixed(2) + " m/s" : "—");
  setText("energy", Number.isFinite(E) ? E.toFixed(3) + " J/kg" : "—");
  setText("ecc", Number.isFinite(e) ? e.toFixed(2) : "—");

  // περίοδος
  // Περίοδος (μορφή 11h 23m 08s με superscripts)
  const periodEl = $("#periodFmt");
  if (periodEl) {
    periodEl.innerHTML = formatPeriodSup(Tsec);
  }

  // Προσαρμογή ορίων slider u γύρω από τις φυσικές τιμές
  const uRange = $("#uRange");
  const uNum = $("#uNum");

  const uMax = Math.max(2 * ue, ue + uc, 1);
  const uMin = 0;

  uRange.min = uMin;
  uNum.min = uMin;
  uRange.max = uMax.toFixed(2);
  uNum.max = uMax.toFixed(2);

  // Clamp της state.u εντός των νέων ορίων
  if (state.u > uMax) state.u = uMax;
  if (state.u < uMin) state.u = uMin;

  uRange.value = state.u;
  uNum.value = state.u;
}
