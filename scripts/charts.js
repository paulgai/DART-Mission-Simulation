// charts.js – Apache ECharts + zoom/pan + save image (toolbox)
// Γραφήματα: E(t), r(t), u(t), L(t)

import { G } from "./config.js";

// Πόσα δεκαδικά ανά γράφημα
const ENERGY_DECIMALS = 6; // E, K, U
const SPEED_DECIMALS = 6; // u
const RADIUS_DECIMALS = 2; // r
const BRIGHT_DECIMALS = 3; // L (0–1)

// Πόσα δεκαδικά ΕΜΦΑΝΙΖΟΝΤΑΙ στον άξονα y
const ENERGY_AXIS_DECIMALS = 4;
const SPEED_AXIS_DECIMALS = 4;
const RADIUS_AXIS_DECIMALS = 0;
const BRIGHT_AXIS_DECIMALS = 1; // για τα %, π.χ. 95.3%

// Ελάχιστο εύρος (span) στον άξονα y για autofit
const ENERGY_Y_MIN_SPAN = 1e-3; // τουλάχιστον 0.001 στις ενέργειες
const SPEED_Y_MIN_SPAN = 1e-3; // τουλάχιστον 0.001 στην ταχύτητα
const RADIUS_Y_MIN_SPAN = 10.0; // τουλάχιστον 1 m στην απόσταση

// div containers
let energyDiv = null;
let radiusDiv = null;
let velDiv = null;
let brightDiv = null;

// ECharts instances
let energyPlot = null;
let radiusPlot = null;
let velPlot = null;
let brightPlot = null;

// Για τη φωτεινότητα
let prevRx = null;
let prevRy = null;

// Δεδομένα
let energyX = [];
let energyTotal = [];
let energyKin = [];
let energyPot = [];

let radiusX = [];
let radiusY = [];

let velX = [];
let velY = [];

let brightX = [];
let brightY = [];

let tHours = 0;

const MAX_POINTS = 10000;
const REDRAW_EVERY = 10;
let redrawCounter = 0;

// ===== helpers φυσικής =====
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

function computeBrightness(state) {
  const rx = state.r?.x ?? 0;
  const ry = state.r?.y ?? 0;

  let L = 1.0;

  if (prevRx !== null && prevRy !== null) {
    const x1 = prevRx;
    const y1 = prevRy;
    const x2 = rx;
    const y2 = ry;

    if ((x1 <= 0 && x2 >= 0) || (x1 >= 0 && x2 <= 0)) {
      const denom = x2 - x1;
      let t0;

      if (Math.abs(denom) < 1e-12) {
        t0 = 0.5;
      } else {
        t0 = -x1 / denom;
      }

      if (t0 >= 0 && t0 <= 1) {
        const y0 = y1 + t0 * (y2 - y1);
        if (y0 > 0) {
          L = 0.95;
        }
      }
    }
  }

  if (L === 1.0 && ry > 0) {
    let width = state.crashR;
    if (!Number.isFinite(width) || width <= 0) {
      const rmag = computeRadius(state);
      if (Number.isFinite(rmag) && rmag > 0) {
        width = 0.05 * rmag;
      } else {
        width = 1;
      }
    }

    if (Math.abs(rx) < width) {
      L = 0.95;
    }
  }

  prevRx = rx;
  prevRy = ry;

  return L;
}

// ===== trim =====
function trimSeries(arr) {
  if (arr.length > MAX_POINTS) {
    const extra = arr.length - MAX_POINTS;
    arr.splice(0, extra);
  }
}

function trimAll() {
  trimSeries(energyX);
  trimSeries(energyTotal);
  trimSeries(energyKin);
  trimSeries(energyPot);

  trimSeries(radiusX);
  trimSeries(radiusY);

  trimSeries(velX);
  trimSeries(velY);

  trimSeries(brightX);
  trimSeries(brightY);
}

// ===== κοινές ρυθμίσεις γραφήματος =====
function baseChartOption({ yName, yFormatter, yMinInterval, yMin, yMax }) {
  return {
    backgroundColor: "transparent",
    textStyle: {
      color: "#d0d4ff",
      fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: 11,
    },
    grid: {
      left: 45,
      right: 18,
      top: 26,
      bottom: 26,
    },
    toolbox: {
      show: true,
      right: 8,
      top: 4,
      feature: {
        saveAsImage: {
          pixelRatio: 4, // μεγαλύτερη ανάλυση
        },
        dataZoom: {
          yAxisIndex: "none",
        },
      },
      iconStyle: {
        borderColor: "#e5e7eb",
      },
      emphasis: {
        iconStyle: {
          borderColor: "#ffffff",
        },
      },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: "rgba(15,23,42,0.9)",
      borderColor: "#4b5563",
      textStyle: { color: "#e5e7eb", fontSize: 11 },
      valueFormatter: (val) => val,
    },
    xAxis: {
      type: "value",
      name: "t (h)",
      nameLocation: "end",
      nameGap: 18,
      axisLabel: {
        color: "#d0d4ff",
        fontSize: 10,
        formatter: (v) => v.toFixed(2),
      },
      axisLine: { lineStyle: { color: "#6b7280" } },
      splitLine: {
        show: true,
        lineStyle: { color: "rgba(255,255,255,0.16)" },
      },
    },
    yAxis: {
      type: "value",
      name: yName || "",
      nameGap: 26,
      min: typeof yMin === "number" ? yMin : "dataMin",
      max: typeof yMax === "number" ? yMax : "dataMax",
      minInterval: typeof yMinInterval === "number" ? yMinInterval : null,
      axisLabel: {
        color: "#d0d4ff",
        fontSize: 10,
        formatter: (v) => (yFormatter ? yFormatter(v) : v),
      },
      axisLine: { lineStyle: { color: "#6b7280" } },
      splitLine: {
        show: true,
        lineStyle: { color: "rgba(255,255,255,0.16)" },
      },
    },
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
        moveOnMouseWheelCenter: true,
      },
    ],
    series: [],
  };
}

// ===== δημιουργία γραφημάτων =====
function createEnergyPlot() {
  if (!energyDiv || typeof echarts === "undefined") return;
  if (energyPlot) return;

  energyPlot = echarts.init(energyDiv);

  const option = baseChartOption({
    yName: "E (J/kg)",
    yMinInterval: 0.001,
    yFormatter: (v) => v.toFixed(ENERGY_AXIS_DECIMALS),
  });

  option.series = [
    {
      name: "E",
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2 },
      data: [],
    },
    {
      name: "K",
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 1.5 },
      data: [],
    },
    {
      name: "U",
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 1.5 },
      data: [],
    },
  ];

  option.legend = {
    top: 4,
    left: 10,
    textStyle: { color: "#cbd5f5", fontSize: 10 },
    selected: { E: true, K: false, U: false },
  };

  energyPlot.setOption(option);

  // Όταν αλλάζει το legend (E/K/U on-off) κάνε refit στον άξονα y
  energyPlot.on("legendselectchanged", () => {
    recomputeEnergyYAxisSpan();
  });
}

function createRadiusPlot() {
  if (!radiusDiv || typeof echarts === "undefined") return;
  if (radiusPlot) return;

  radiusPlot = echarts.init(radiusDiv);

  const option = baseChartOption({
    yName: "r (m)",
    yMinInterval: 1,
    yFormatter: (v) => v.toFixed(RADIUS_AXIS_DECIMALS),
  });

  option.series = [
    {
      name: "r",
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2 },
      data: [],
    },
  ];

  radiusPlot.setOption(option);
}

function createVelPlot() {
  if (!velDiv || typeof echarts === "undefined") return;
  if (velPlot) return;

  velPlot = echarts.init(velDiv);

  const option = baseChartOption({
    yName: "u (m/s)",
    yMinInterval: 0.001,
    yFormatter: (v) => v.toFixed(SPEED_AXIS_DECIMALS),
  });

  option.series = [
    {
      name: "u",
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2 },
      data: [],
    },
  ];

  velPlot.setOption(option);
}

function createBrightPlot() {
  if (!brightDiv || typeof echarts === "undefined") return;
  if (brightPlot) return;

  brightPlot = echarts.init(brightDiv);

  const option = baseChartOption({
    yName: "L (%)",
    yMin: 0.94,
    yMax: 1.0,
    yFormatter: (v) => (v * 100).toFixed(BRIGHT_AXIS_DECIMALS) + "%",
  });

  option.series = [
    {
      name: "L",
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2 },
      data: [],
    },
  ];

  brightPlot.setOption(option);
}

// helper για min/max + εφαρμογή minSpan
function computeSpanWithMin(arr, minSpan) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  let span = max - min;
  if (span < minSpan) {
    const mid = 0.5 * (min + max);
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  return { min, max };
}

function recomputeEnergyYAxisSpan() {
  if (!energyPlot) return;

  const opt = energyPlot.getOption();
  const legendArr = opt.legend || [];
  const selected = legendArr[0]?.selected || {};

  const values = [];

  if (selected.E) {
    for (const v of energyTotal) {
      if (Number.isFinite(v)) values.push(v);
    }
  }
  if (selected.K) {
    for (const v of energyKin) {
      if (Number.isFinite(v)) values.push(v);
    }
  }
  if (selected.U) {
    for (const v of energyPot) {
      if (Number.isFinite(v)) values.push(v);
    }
  }

  if (!values.length) return;

  const span = computeSpanWithMin(values, ENERGY_Y_MIN_SPAN);
  if (!span) return;

  energyPlot.setOption({
    yAxis: { min: span.min, max: span.max },
  });
}

// ===== ενημέρωση δεδομένων =====
function updateAllPlots() {
  trimAll();

  if (energyPlot) {
    const sE = energyX.map((t, i) => [t, energyTotal[i]]);
    const sK = energyX.map((t, i) => [t, energyKin[i]]);
    const sU = energyX.map((t, i) => [t, energyPot[i]]);

    energyPlot.setOption({
      series: [{ data: sE }, { data: sK }, { data: sU }],
    });

    // fit με βάση όσα είναι ενεργά στο legend (E / K / U)
    recomputeEnergyYAxisSpan();
  }

  if (radiusPlot) {
    const sR = radiusX.map((t, i) => [t, radiusY[i]]);
    const span = computeSpanWithMin(radiusY, RADIUS_Y_MIN_SPAN);
    radiusPlot.setOption({
      series: [{ data: sR }],
      yAxis: span ? { min: span.min, max: span.max } : {},
    });
  }

  if (velPlot) {
    const sV = velX.map((t, i) => [t, velY[i]]);
    const span = computeSpanWithMin(velY, SPEED_Y_MIN_SPAN);
    velPlot.setOption({
      series: [{ data: sV }],
      yAxis: span ? { min: span.min, max: span.max } : {},
    });
  }

  if (brightPlot) {
    const sL = brightX.map((t, i) => [t, brightY[i]]);
    // εδώ κρατάμε το fixed [0.94, 1.0]
    brightPlot.setOption({
      series: [{ data: sL }],
    });
  }
}

// ===== init / reset / update / resize =====
export function initCharts(state) {
  energyDiv = document.getElementById("energyChart");
  radiusDiv = document.getElementById("radiusChart");
  velDiv = document.getElementById("velocityChart");
  brightDiv = document.getElementById("brightnessChart");

  energyX = [];
  energyTotal = [];
  energyKin = [];
  energyPot = [];

  radiusX = [];
  radiusY = [];

  velX = [];
  velY = [];

  brightX = [];
  brightY = [];

  tHours = 0;
  redrawCounter = 0;

  prevRx = state.r?.x ?? null;
  prevRy = state.r?.y ?? null;

  const { E, K, U } = computeEnergyParts(state);
  const r0 = computeRadius(state);
  const v0 = computeSpeed(state);
  const L0 = computeBrightness(state);

  if (Number.isFinite(E) && Number.isFinite(K) && Number.isFinite(U)) {
    energyX.push(0);
    energyTotal.push(Number(E.toFixed(ENERGY_DECIMALS)));
    energyKin.push(Number(K.toFixed(ENERGY_DECIMALS)));
    energyPot.push(Number(U.toFixed(ENERGY_DECIMALS)));
  }

  if (Number.isFinite(r0)) {
    radiusX.push(0);
    radiusY.push(Number(r0.toFixed(RADIUS_DECIMALS)));
  }

  if (Number.isFinite(v0)) {
    velX.push(0);
    velY.push(Number(v0.toFixed(SPEED_DECIMALS)));
  }

  if (Number.isFinite(L0)) {
    brightX.push(0);
    brightY.push(Number(L0.toFixed(BRIGHT_DECIMALS)));
  }

  createEnergyPlot();
  createRadiusPlot();
  createVelPlot();
  createBrightPlot();
  updateAllPlots();
}

export function resetEnergySeries(state) {
  energyX = [];
  energyTotal = [];
  energyKin = [];
  energyPot = [];

  radiusX = [];
  radiusY = [];

  velX = [];
  velY = [];

  brightX = [];
  brightY = [];

  tHours = 0;
  redrawCounter = 0;

  prevRx = state.r?.x ?? null;
  prevRy = state.r?.y ?? null;

  const { E, K, U } = computeEnergyParts(state);
  const r0 = computeRadius(state);
  const v0 = computeSpeed(state);
  const L0 = computeBrightness(state);

  if (Number.isFinite(E) && Number.isFinite(K) && Number.isFinite(U)) {
    energyX.push(0);
    energyTotal.push(Number(E.toFixed(ENERGY_DECIMALS)));
    energyKin.push(Number(K.toFixed(ENERGY_DECIMALS)));
    energyPot.push(Number(U.toFixed(ENERGY_DECIMALS)));
  }

  if (Number.isFinite(r0)) {
    radiusX.push(0);
    radiusY.push(Number(r0.toFixed(RADIUS_DECIMALS)));
  }

  if (Number.isFinite(v0)) {
    velX.push(0);
    velY.push(Number(v0.toFixed(SPEED_DECIMALS)));
  }

  if (Number.isFinite(L0)) {
    brightX.push(0);
    brightY.push(Number(L0.toFixed(BRIGHT_DECIMALS)));
  }

  updateAllPlots();
}

export function addEnergySample(state, dtSimSec) {
  if (typeof dtSimSec === "number" && Number.isFinite(dtSimSec)) {
    tHours += dtSimSec / 3600;
  }

  const { E, K, U } = computeEnergyParts(state);
  const rmag = computeRadius(state);
  const vmag = computeSpeed(state);
  const L = computeBrightness(state);

  if (
    !Number.isFinite(E) ||
    !Number.isFinite(K) ||
    !Number.isFinite(U) ||
    !Number.isFinite(rmag) ||
    !Number.isFinite(vmag) ||
    !Number.isFinite(L)
  ) {
    return;
  }

  const Et = Number(E.toFixed(ENERGY_DECIMALS));
  const Kt = Number(K.toFixed(ENERGY_DECIMALS));
  const Ut = Number(U.toFixed(ENERGY_DECIMALS));
  const Rt = Number(rmag.toFixed(RADIUS_DECIMALS));
  const Vt = Number(vmag.toFixed(SPEED_DECIMALS));
  const Lt = Number(L.toFixed(BRIGHT_DECIMALS));

  const lastIdx = energyTotal.length - 1;
  if (lastIdx >= 0) {
    const lastE = energyTotal[lastIdx];
    const lastT = energyX[lastIdx];
    const dtH = tHours - lastT;
    if (Et === lastE && dtH < 0.02) {
      return;
    }
  }

  energyX.push(tHours);
  energyTotal.push(Et);
  energyKin.push(Kt);
  energyPot.push(Ut);

  radiusX.push(tHours);
  radiusY.push(Rt);

  velX.push(tHours);
  velY.push(Vt);

  brightX.push(tHours);
  brightY.push(Lt);

  redrawCounter++;
  if (redrawCounter % REDRAW_EVERY !== 0) return;

  updateAllPlots();
}

export function resizeCharts() {
  if (energyDiv && energyPlot) energyPlot.resize();
  if (radiusDiv && radiusPlot) radiusPlot.resize();
  if (velDiv && velPlot) velPlot.resize();
  if (brightDiv && brightPlot) brightPlot.resize();
}
