// charts.js
// Γραφήματα (uPlot) για την εφαρμογή τροχιών.
// Ειδική ενέργεια E_spec(t) [J/kg] σε ώρες προσομοίωσης.

import { G } from "./config.js";

let energyPlot = null;
// energyData[0] = t (h), energyData[1] = E (J/kg)
let energyData = [[], []];

// τρέχον παράθυρο στον άξονα x (ώρες)
let xMin = 0;
let xMax = 10;

// τρέχον range στον άξονα y (E_spec)
let yMin = null;
let yMax = null;

// === helpers ===

// ειδική ενέργεια: E_spec = u^2/2 − GM/r
function computeSpecificEnergy(state) {
  const M = state.M;
  if (!Number.isFinite(M) || M <= 0) return NaN;

  const GM = G * M;
  const rx = state.r?.x ?? 0;
  const ry = state.r?.y ?? 0;
  const vx = state.v?.x ?? 0;
  const vy = state.v?.y ?? 0;

  const r = Math.hypot(rx, ry);
  const u = Math.hypot(vx, vy);
  if (!Number.isFinite(r) || r === 0) return NaN;

  return 0.5 * u * u - GM / r;
}

// χρόνος προσομοίωσης σε ώρες
function getSimTimeHours(state) {
  const tSec = state.time || 0; // state.time σε sec simulation
  return tSec / 3600;
}

// αρχικοποίηση yMin/yMax γύρω από την τρέχουσα τιμή E0
function initYRangeFrom(E0) {
  const span = 0.01; // ±0.01 J/kg
  yMin = E0 - span;
  yMax = E0 + span;
}

// ενημέρωση y-range: μόνο άπλωμα, ποτέ στένεμα
function updateYRange(E) {
  if (!Number.isFinite(E)) return;

  if (yMin === null || yMax === null) {
    initYRangeFrom(E);
    return;
  }

  const pad = 0.005;

  if (E < yMin) {
    yMin = E - pad;
  }
  if (E > yMax) {
    yMax = E + pad;
  }
}

// === public API ===

// αρχικοποίηση γραφήματος (στην εκκίνηση της εφαρμογής)
export function initCharts(state) {
  const el = document.getElementById("energyChart");
  if (!el || typeof window.uPlot === "undefined") return;

  const width = el.clientWidth || 320;
  const height = el.clientHeight || 150;

  energyData = [[], []];

  const t0 = getSimTimeHours(state);
  const E0 = computeSpecificEnergy(state);

  if (Number.isFinite(E0)) {
    energyData[0].push(t0);
    energyData[1].push(E0);
    initYRangeFrom(E0);
  } else {
    yMin = -1;
    yMax = 1;
  }

  xMin = 0;
  xMax = 10;

  energyPlot = new window.uPlot(
    {
      width,
      height,

      // Πιο καθαρό Courier, λίγο μεγαλύτερο
      font: "11px 'Courier New', monospace",
      pxRatio: window.devicePixelRatio || 1,

      scales: {
        x: { time: false },
        y: { auto: false },
      },

      axes: [
        {
          // Άξονας x
          label: "t (h)",
          stroke: "#ffffff",
          font: "11px 'Courier New', monospace",
          labelFont: "11px 'Courier New', monospace",

          grid: {
            stroke: "rgba(255,255,255,0.10)",
            width: 1,
          },
          ticks: {
            show: true,
            size: 4, // μικρά ticks
            width: 1,
            stroke: "rgba(255,255,255,0.8)",
          },

          side: 2, // κάτω άξονας
          labelAlign: 0, // label στο κέντρο
          labelGap: 2, // ΜΙΚΡΟ κενό από τις τιμές
          gap: 2, // απόσταση τιμών από το plot
          space: 20, // συνολικός χώρος κάτω (όχι τόσο μικρός ώστε να κόβονται)

          // πιο πυκνή αρίθμηση στον x άξονα
          splits: (u, min, max) => {
            // αν το εύρος είναι σχεδόν μηδενικό (αρχή), δείξε από 0 ως 10
            let lo = min;
            let hi = max;
            if (
              !Number.isFinite(lo) ||
              !Number.isFinite(hi) ||
              hi - lo < 1e-3
            ) {
              lo = 0;
              hi = 10;
            }

            const step = 1; // 0,1,2,...,10  (βάλε 0.5 αν θες 0.0,0.5,1.0,...)
            const vals = [];
            let v = Math.ceil(lo / step) * step;
            for (; v <= hi + 1e-9; v += step) {
              vals.push(v);
            }
            return vals;
          },

          values: (u, vals) =>
            vals.map((v) => {
              const absV = Math.abs(v);
              const digits = absV >= 10 ? 0 : 1;
              return v.toFixed(digits);
            }),
        },

        {
          // Άξονας y
          label: "E (J/kg)",
          stroke: "#ffffff",
          font: "11px 'Courier New', monospace",
          labelFont: "11px 'Courier New', monospace",

          grid: {
            stroke: "rgba(255,255,255,0.08)",
            width: 1,
          },
          ticks: {
            show: true,
            size: 4, // ΜΙΚΡΑ tick marks
            width: 1,
            stroke: "rgba(255,255,255,0.8)",
          },

          side: 3, // αριστερός άξονας
          labelAlign: 2, // προς τα πάνω
          labelGap: 4,
          gap: 4,
          space: 34,

          values: (u, vals) =>
            vals.map((v) => (Number.isFinite(v) ? v.toFixed(3) : "—")),
        },
      ],

      series: [
        {},
        {
          label: "E",
          stroke: "#3ddc97",
          width: 2,
          spanGaps: true,
        },
      ],

      legend: { show: false },
      cursor: {
        x: true,
        y: true,
        drag: {
          x: true,
          y: false,
        },
        points: { show: false },
      },
    },
    energyData,
    el
  );

  energyPlot.setScale("x", { min: xMin, max: xMax });
  energyPlot.setScale("y", { min: yMin, max: yMax });
}

// RESET μόνο όταν κάνεις Reset αρχικών συνθηκών (ΟΧΙ στο pause/start)
export function resetEnergySeries(state) {
  energyData = [[], []];

  const t0 = getSimTimeHours(state);
  const E0 = computeSpecificEnergy(state);

  if (Number.isFinite(E0)) {
    energyData[0].push(t0);
    energyData[1].push(E0);
    initYRangeFrom(E0);
  } else {
    yMin = -1;
    yMax = 1;
  }

  xMin = 0;
  xMax = 10;

  if (energyPlot) {
    energyPlot.setData(energyData);
    energyPlot.setScale("x", { min: xMin, max: xMax });
    energyPlot.setScale("y", { min: yMin, max: yMax });
  }
}

// προσθήκη νέου δείγματος E(t)
// ΚΑΛΕΙΤΑΙ ΜΟΝΟ από advancePlayback όταν state.running === true
export function addEnergySample(state) {
  if (!energyPlot) return;

  const tH = getSimTimeHours(state);
  const E = computeSpecificEnergy(state);
  if (!Number.isFinite(E)) return;

  energyData[0].push(tH);
  energyData[1].push(E);

  // ενημέρωση y-range
  updateYRange(E);

  // sliding παράθυρο 10h στον x άξονα
  if (tH <= 10) {
    xMin = 0;
    xMax = 10;
  } else {
    xMax = tH;
    xMin = tH - 10;
  }

  const MAX_POINTS = 4000;
  if (energyData[0].length > MAX_POINTS) {
    const cut = energyData[0].length - MAX_POINTS;
    energyData[0].splice(0, cut);
    energyData[1].splice(0, cut);
  }

  energyPlot.setData(energyData);
  energyPlot.setScale("x", { min: xMin, max: xMax });
  energyPlot.setScale("y", { min: yMin, max: yMax });
}

// resize όταν αλλάζει το layout
export function resizeCharts() {
  if (!energyPlot) return;
  const el = document.getElementById("energyChart");
  if (!el) return;

  energyPlot.setSize({
    width: el.clientWidth || 320,
    height: el.clientHeight || 220,
  });

  // διατήρηση των τρεχόντων ορίων
  energyPlot.setScale("x", { min: xMin, max: xMax });
  energyPlot.setScale("y", { min: yMin, max: yMax });
}
