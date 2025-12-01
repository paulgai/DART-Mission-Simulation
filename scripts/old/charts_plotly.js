// charts.js – έκδοση με Plotly
// Γραφήματα: E(t), r(t), u(t), a(t), L(t) με zoom/pan κλπ.

import { G } from "./config.js";
const TIME_WINDOW_HOURS = 48;
let energyDiv = null; // div για το γράφημα ενέργειας
let radiusDiv = null; // div για το γράφημα απόστασης
let velDiv = null; // div για το γράφημα ταχύτητας
let brightDiv = null; // div για το γράφημα φωτεινότητας

let energyLayout = null;
let radiusLayout = null;
let velLayout = null;
let accLayout = null;
let brightLayout = null;
let config = null;
// Για την ανίχνευση διελεύσεων στη φωτεινότητα
let prevRx = null;
let prevRy = null;

// ===== Δεδομένα για τα γραφήματα =====

// x = t (ώρες)
let energyX = [];
// Ενέργειες ανά μονάδα μάζας (J/kg)
let energyTotal = []; // E = K + U
let energyKin = []; // K = u^2/2
let energyPot = []; // U = -GM/r

// Απόσταση r(t) (m)
let radiusX = [];
let radiusY = [];

// Ταχύτητα u(t) (m/s)
let velX = [];
let velY = [];

// Επιτάχυνση a(t) (m/s²)
let accX = [];
let accY = [];

// Φωτεινότητα L(t) (σχετική)
let brightX = [];
let brightY = [];

// Χρόνος προσομοίωσης σε ώρες
let tHours = 0;

// Ρυθμίσεις απόδοσης
const MAX_POINTS = 10000;
const EXTEND_EVERY = 50;
const RELAYOUT_EVERY = 2;
//EXTEND_EVERY*RELAYOUT_EVERY=100

let pendingX = [];
let pendingTotal = [];
let pendingKin = [];
let pendingPot = [];
let pendingRadius = [];
let pendingVel = [];
let pendingBright = [];

let extendCounter = 0;
let relayoutCounter = 0;

// ===== Βοηθητικές συναρτήσεις από την κατάσταση =====
function computeEnergyParts(state) {
  const M = state.M;
  if (!Number.isFinite(M) || M <= 0) {
    return { E: NaN, K: NaN, U: NaN };
  }

  const GM = G * M;
  const rx = state.r?.x ?? 0;
  const ry = state.r?.y ?? 0;
  const vx = state.v?.x ?? 0;
  const vy = state.v?.y ?? 0;

  const rmag = Math.hypot(rx, ry);
  const vmag = Math.hypot(vx, vy);

  if (!Number.isFinite(rmag) || rmag === 0 || !Number.isFinite(vmag)) {
    return { E: NaN, K: NaN, U: NaN };
  }

  const K = 0.5 * vmag * vmag;
  const U = -(GM / rmag);
  const E = K + U;

  return { E, K, U };
}

function computeRadius(state) {
  const rx = state.r?.x ?? 0;
  const ry = state.r?.y ?? 0;
  const rmag = Math.hypot(rx, ry);
  return Number.isFinite(rmag) ? rmag : NaN;
}

function computeSpeed(state) {
  const vx = state.v?.x ?? 0;
  const vy = state.v?.y ?? 0;
  const vmag = Math.hypot(vx, vy);
  return Number.isFinite(vmag) ? vmag : NaN;
}

function computeAccelMag(state) {
  // Προσπάθησε πρώτα από state.a, αν υπάρχει
  const ax = state.a?.x ?? NaN;
  const ay = state.a?.y ?? NaN;
  let amag = Math.hypot(ax, ay);

  if (Number.isFinite(amag) && amag > 0) {
    return amag;
  }

  // Εναλλακτικά, υπολογισμός από τον νόμο βαρύτητας: a = GM / r²
  const M = state.M;
  if (!Number.isFinite(M) || M <= 0) return NaN;
  const GM = G * M;

  const rx = state.r?.x ?? 0;
  const ry = state.r?.y ?? 0;
  const rmag = Math.hypot(rx, ry);
  if (!Number.isFinite(rmag) || rmag === 0) return NaN;

  amag = GM / (rmag * rmag);
  return Number.isFinite(amag) ? amag : NaN;
}

function computeBrightness(state) {
  const rx = state.r?.x ?? 0;
  const ry = state.r?.y ?? 0;

  // Βασική φωτεινότητα
  let L = 1.0;

  // --- Ανίχνευση τομής του τμήματος (prev → τώρα) με την ευθεία x = 0 ---
  if (prevRx !== null && prevRy !== null) {
    const x1 = prevRx;
    const y1 = prevRy;
    const x2 = rx;
    const y2 = ry;

    // Υπάρχει πιθανή τομή με x=0 αν τα x αλλάζουν πρόσημο ή κάποιο είναι 0
    if ((x1 <= 0 && x2 >= 0) || (x1 >= 0 && x2 <= 0)) {
      const denom = x2 - x1;
      let t0;

      if (Math.abs(denom) < 1e-12) {
        // πολύ μικρή μεταβολή σε x → πάρε μέση τιμή
        t0 = 0.5;
      } else {
        // γραμμική παρεμβολή: x(t) = x1 + t (x2 - x1) = 0 → t = -x1 / (x2 - x1)
        t0 = -x1 / denom;
      }

      if (t0 >= 0 && t0 <= 1) {
        const y0 = y1 + t0 * (y2 - y1);
        // ΜΟΝΟ αν το σημείο τομής είναι "πάνω" από το M (y>0) ρίχνουμε φωτεινότητα
        if (y0 > 0) {
          L = 0.95;
        }
      }
    }
  }

  // --- Προαιρετικό fallback: πολύ κοντά στον άξονα x=0 και πάνω από το M ---
  if (L === 1.0 && ry > 0) {
    let width = state.crashR;
    if (!Number.isFinite(width) || width <= 0) {
      const rmag = computeRadius(state);
      if (Number.isFinite(rmag) && rmag > 0) {
        width = 0.05 * rmag; // αν θες πιο «φαρδιά» διέλευση, αύξησε το 0.05
      } else {
        width = 1;
      }
    }

    if (Math.abs(rx) < width) {
      L = 0.95;
    }
  }

  // ενημέρωση προηγούμενης θέσης για το επόμενο βήμα
  prevRx = rx;
  prevRy = ry;

  return L;
}

// ===== Traces =====
function buildEnergyTraces() {
  return [
    {
      x: energyX,
      y: energyTotal,
      mode: "lines",
      type: "scattergl",
      line: {
        color: "#3ddc97",
        width: 2,
        shape: "linear",
      },
      name: "E = K + U",
    },
    {
      x: energyX,
      y: energyKin,
      mode: "lines",
      type: "scattergl",
      line: {
        color: "#f4a261",
        width: 1.5,
        shape: "linear",
      },
      name: "K = u²/2",
    },
    {
      x: energyX,
      y: energyPot,
      mode: "lines",
      type: "scattergl",
      line: {
        color: "#00b4d8",
        width: 1.5,
        shape: "linear",
      },
      name: "U = −GM/r",
    },
  ];
}

function buildRadiusTrace() {
  return {
    x: radiusX,
    y: radiusY,
    mode: "lines",
    type: "scattergl",
    line: {
      width: 1.8,
      shape: "linear",
    },
    name: "r",
  };
}

function buildVelocityTrace() {
  return {
    x: velX,
    y: velY,
    mode: "lines",
    type: "scattergl",
    line: {
      width: 1.8,
      shape: "linear",
    },
    name: "u",
  };
}

function buildBrightnessTrace() {
  return {
    x: brightX,
    y: brightY,
    mode: "lines",
    type: "scattergl",
    line: {
      width: 1.8,
      shape: "linear",
    },
    name: "L",
  };
}

// ===== Αρχικοποίηση γραφημάτων =====
export function initCharts(state) {
  energyDiv = document.getElementById("energyChart");
  radiusDiv = document.getElementById("radiusChart");
  velDiv = document.getElementById("velocityChart");
  brightDiv = document.getElementById("brightnessChart");

  if (!energyDiv || typeof Plotly === "undefined") return;

  // Μηδενισμός σειρών
  energyX = [];
  energyTotal = [];
  energyKin = [];
  energyPot = [];

  radiusX = [];
  radiusY = [];

  velX = [];
  velY = [];

  accX = [];
  accY = [];

  brightX = [];
  brightY = [];

  tHours = 0;

  const traces = buildEnergyTraces();

  energyLayout = {
    margin: { l: 55, r: 10, t: 6, b: 32 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",

    xaxis: {
      title: {
        text: "",
        font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
      },
      color: "#e9eefc",
      gridcolor: "rgba(255,255,255,0.12)",
      linecolor: "rgba(255,255,255,0.7)",
      zeroline: false,
      range: [0, TIME_WINDOW_HOURS],
      tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
    },

    yaxis: {
      title: {
        text: "E (J/kg)",
        font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
      },
      color: "#e9eefc",
      gridcolor: "rgba(255,255,255,0.16)",
      linecolor: "rgba(255,255,255,0.7)",
      zeroline: false,
      autorange: true,
      tickformat: ".4f",
      tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
    },

    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: -0.25, // κάτω από τον άξονα x
      xanchor: "left",
      yanchor: "top",
    },
    font: {
      family: "'Arial', monospace",
      size: 11,
      color: "#ccccccff",
    },
    annotations: [
      {
        x: 0.5,
        y: -0.25,
        xref: "paper",
        yref: "paper",
        text: "t (h)",
        showarrow: false,
        font: {
          family: "'Arial', monospace",
          size: 11,
          color: "#e9eefc",
        },
      },
    ],
  };

  config = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: [
      "select2d",
      "lasso2d",
      "resetScale2d",
      "autoScale2d",
      "toggleSpikelines",
    ],
    toImageButtonOptions: {
      format: "png",
      filename: "orbit-plot",
      height: 600,
      width: 800,
      scale: 2,
    },
  };

  Plotly.newPlot(energyDiv, traces, energyLayout, config);

  // r(t)
  if (radiusDiv) {
    radiusLayout = {
      margin: { l: 55, r: 10, t: 6, b: 32 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",

      xaxis: {
        title: {
          text: "t (h)",
          font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
        },
        color: "#e9eefc",
        gridcolor: "rgba(255,255,255,0.12)",
        linecolor: "rgba(255,255,255,0.7)",
        zeroline: false,
        range: [0, TIME_WINDOW_HOURS],
        tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
      },

      yaxis: {
        title: {
          text: "r (m)",
          font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
        },
        color: "#e9eefc",
        gridcolor: "rgba(255,255,255,0.16)",
        linecolor: "rgba(255,255,255,0.7)",
        zeroline: false,
        autorange: true,
        tickformat: ".0f",
        tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
      },

      showlegend: false,
      font: {
        family: "'Arial', monospace",
        size: 11,
        color: "#ccccccff",
      },
    };

    const rTrace = buildRadiusTrace();
    Plotly.newPlot(radiusDiv, [rTrace], radiusLayout, config);
  }

  // u(t)
  if (velDiv) {
    velLayout = {
      margin: { l: 55, r: 10, t: 6, b: 32 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",

      xaxis: {
        title: {
          text: "t (h)",
          font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
        },
        color: "#e9eefc",
        gridcolor: "rgba(255,255,255,0.12)",
        linecolor: "rgba(255,255,255,0.7)",
        zeroline: false,
        range: [0, TIME_WINDOW_HOURS],
        tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
      },

      yaxis: {
        title: {
          text: "u (m/s)",
          font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
        },
        color: "#e9eefc",
        gridcolor: "rgba(255,255,255,0.16)",
        linecolor: "rgba(255,255,255,0.7)",
        zeroline: false,
        autorange: true,
        tickformat: ".3f",
        tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
      },

      showlegend: false,
      font: {
        family: "'Arial', monospace",
        size: 11,
        color: "#ccccccff",
      },
    };

    const vTrace = buildVelocityTrace();
    Plotly.newPlot(velDiv, [vTrace], velLayout, config);
  }

  // L(t)
  if (brightDiv) {
    brightLayout = {
      margin: { l: 55, r: 10, t: 6, b: 32 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",

      xaxis: {
        title: {
          text: "t (h)",
          font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
        },
        color: "#e9eefc",
        gridcolor: "rgba(255,255,255,0.12)",
        linecolor: "rgba(255,255,255,0.7)",
        zeroline: false,
        range: [0, TIME_WINDOW_HOURS],
        tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
      },

      yaxis: {
        title: {
          text: "L (%)",
          font: { family: "'Arial', monospace", size: 11, color: "#e9eefc" },
        },
        color: "#e9eefc",
        gridcolor: "rgba(255,255,255,0.16)",
        linecolor: "rgba(255,255,255,0.7)",
        zeroline: false,
        autorange: true,
        tickformat: ".0%",
        tickfont: { family: "'Arial', monospace", size: 10, color: "#cfe3ff" },
      },

      showlegend: false,
      font: {
        family: "'Arial', monospace",
        size: 11,
        color: "#ccccccff",
      },
    };

    const bTrace = buildBrightnessTrace();
    Plotly.newPlot(brightDiv, [bTrace], brightLayout, config);
  }
}

// ===== Reset όταν αλλάζουν αρχικές συνθήκες ή πατάς Reset =====
export function resetEnergySeries(state) {
  if (!energyDiv || typeof Plotly === "undefined") return;

  energyX = [];
  energyTotal = [];
  energyKin = [];
  energyPot = [];

  radiusX = [];
  radiusY = [];

  velX = [];
  velY = [];

  accX = [];
  accY = [];

  brightX = [];
  brightY = [];

  tHours = 0;

  pendingX = [];
  pendingTotal = [];
  pendingKin = [];
  pendingPot = [];
  pendingRadius = [];
  pendingVel = [];
  pendingBright = [];
  extendCounter = 0;
  relayoutCounter = 0;

  // αρχικοποίηση προηγούμενης θέσης για φωτεινότητα
  prevRx = state.r?.x ?? null;
  prevRy = state.r?.y ?? null;

  const { E, K, U } = computeEnergyParts(state);
  const r0 = computeRadius(state);
  const v0 = computeSpeed(state);
  const a0 = computeAccelMag(state);
  const L0 = computeBrightness(state);

  if (Number.isFinite(E) && Number.isFinite(K) && Number.isFinite(U)) {
    const Et = Number(E.toFixed(5));
    const Kt = Number(K.toFixed(5));
    const Ut = Number(U.toFixed(5));
    energyX.push(0);
    energyTotal.push(Et);
    energyKin.push(Kt);
    energyPot.push(Ut);
  }

  if (Number.isFinite(r0)) {
    radiusX.push(0);
    radiusY.push(Number(r0.toFixed(3)));
  }

  if (Number.isFinite(v0)) {
    velX.push(0);
    velY.push(Number(v0.toFixed(5)));
  }

  if (Number.isFinite(L0)) {
    brightX.push(0);
    brightY.push(Number(L0.toFixed(3)));
  }
  //console.log("resetEnergySeries", energyX, energyTotal);
  const traces = buildEnergyTraces();
  energyLayout.xaxis.range = [0, TIME_WINDOW_HOURS];
  Plotly.react(energyDiv, traces, energyLayout, config);

  if (radiusDiv && radiusLayout) {
    const rTrace = buildRadiusTrace();
    radiusLayout.xaxis.range = [0, TIME_WINDOW_HOURS];
    Plotly.react(radiusDiv, [rTrace], radiusLayout, config);
  }

  if (velDiv && velLayout) {
    const vTrace = buildVelocityTrace();
    velLayout.xaxis.range = [0, TIME_WINDOW_HOURS];
    Plotly.react(velDiv, [vTrace], velLayout, config);
  }

  if (brightDiv && brightLayout) {
    const bTrace = buildBrightnessTrace();
    brightLayout.xaxis.range = [0, TIME_WINDOW_HOURS];
    Plotly.react(brightDiv, [bTrace], brightLayout, config);
  }
}

// ===== Προσθήκη δείγματος σε όλα τα γραφήματα κατά την προσομοίωση =====
export function addEnergySample(state, dtSimSec) {
  if (!energyDiv || typeof Plotly === "undefined") return;

  if (typeof dtSimSec === "number" && Number.isFinite(dtSimSec)) {
    tHours += dtSimSec / 3600;
  }

  const { E, K, U } = computeEnergyParts(state);
  const rmag = computeRadius(state);
  const vmag = computeSpeed(state);
  const amag = computeAccelMag(state);
  const L = computeBrightness(state);

  if (
    !Number.isFinite(E) ||
    !Number.isFinite(K) ||
    !Number.isFinite(U) ||
    !Number.isFinite(rmag) ||
    !Number.isFinite(vmag) ||
    !Number.isFinite(amag) ||
    !Number.isFinite(L)
  ) {
    return;
  }

  const Et = Number(E.toFixed(5));
  const Kt = Number(K.toFixed(5));
  const Ut = Number(U.toFixed(5));
  const Rt = Number(rmag.toFixed(3));
  const Vt = Number(vmag.toFixed(5));
  const Lt = Number(L.toFixed(3));

  const lastIdx = energyTotal.length - 1;
  if (lastIdx >= 0) {
    const lastE = energyTotal[lastIdx];
    const lastT = energyX[lastIdx];
    const dtH = tHours - lastT;
    if (Et === lastE && dtH < 0.02) {
      return;
    }
  }

  pendingX.push(tHours);
  pendingTotal.push(Et);
  pendingKin.push(Kt);
  pendingPot.push(Ut);
  pendingRadius.push(Rt);
  pendingVel.push(Vt);
  pendingBright.push(Lt);

  if (pendingX.length < EXTEND_EVERY) {
    return;
  }

  // extend ενέργειες
  Plotly.extendTraces(
    energyDiv,
    {
      x: [pendingX, pendingX, pendingX],
      y: [pendingTotal, pendingKin, pendingPot],
    },
    [0, 1, 2],
    MAX_POINTS
  );

  // extend r(t)
  if (radiusDiv) {
    Plotly.extendTraces(
      radiusDiv,
      {
        x: [pendingX],
        y: [pendingRadius],
      },
      [0],
      MAX_POINTS
    );
  }

  // extend u(t)
  if (velDiv) {
    Plotly.extendTraces(
      velDiv,
      {
        x: [pendingX],
        y: [pendingVel],
      },
      [0],
      MAX_POINTS
    );
  }

  // extend L(t)
  if (brightDiv) {
    Plotly.extendTraces(
      brightDiv,
      {
        x: [pendingX],
        y: [pendingBright],
      },
      [0],
      MAX_POINTS
    );
  }

  // κρατάμε και στα "λογικά" arrays
  for (let i = 0; i < pendingX.length; i++) {
    const t = pendingX[i];

    energyX.push(t);
    energyTotal.push(pendingTotal[i]);
    energyKin.push(pendingKin[i]);
    energyPot.push(pendingPot[i]);

    radiusX.push(t);
    radiusY.push(pendingRadius[i]);

    velX.push(t);
    velY.push(pendingVel[i]);

    brightX.push(t);
    brightY.push(pendingBright[i]);
  }

  pendingX = [];
  pendingTotal = [];
  pendingKin = [];
  pendingPot = [];
  pendingRadius = [];
  pendingVel = [];
  pendingBright = [];

  extendCounter++;

  if (extendCounter % RELAYOUT_EVERY !== 0) {
    return;
  }

  let maxT = tHours;
  let minT;

  if (maxT < TIME_WINDOW_HOURS) {
    // ΠΡΙΝ γεμίσει το παράθυρο: κρατάμε 0..TIME_WINDOW_HOURS
    minT = 0;
    maxT = TIME_WINDOW_HOURS;
  } else {
    // ΑΦΟΥ γεμίσει: παράθυρο που κυλάει
    minT = maxT - TIME_WINDOW_HOURS;
  }

  Plotly.relayout(energyDiv, {
    "xaxis.range": [minT, maxT],
    "yaxis.autorange": true,
  });

  if (radiusDiv) {
    Plotly.relayout(radiusDiv, {
      "xaxis.range": [minT, maxT],
      "yaxis.autorange": true,
    });
  }

  if (velDiv) {
    Plotly.relayout(velDiv, {
      "xaxis.range": [minT, maxT],
      "yaxis.autorange": true,
    });
  }

  if (brightDiv) {
    Plotly.relayout(brightDiv, {
      "xaxis.range": [minT, maxT],
      "yaxis.range": [0.9, 1.01],
    });
  }

  relayoutCounter++;
}

// ===== Resize όταν αλλάζει το layout / μέγεθος panel =====
export function resizeCharts() {
  if (typeof Plotly === "undefined") return;

  if (energyDiv) {
    const width = energyDiv.clientWidth || 320;
    const height = energyDiv.clientHeight || 220;
    Plotly.relayout(energyDiv, { width, height });
  }

  if (radiusDiv) {
    const width = radiusDiv.clientWidth || 320;
    const height = radiusDiv.clientHeight || 220;
    Plotly.relayout(radiusDiv, { width, height });
  }

  if (velDiv) {
    const width = velDiv.clientWidth || 320;
    const height = velDiv.clientHeight || 220;
    Plotly.relayout(velDiv, { width, height });
  }

  if (brightDiv) {
    const width = brightDiv.clientWidth || 320;
    const height = brightDiv.clientHeight || 220;
    Plotly.relayout(brightDiv, { width, height });
  }
}
