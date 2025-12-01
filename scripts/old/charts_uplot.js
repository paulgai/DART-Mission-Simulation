// charts.js – uPlot + zoom/pan + PNG export
// Γραφήματα: E(t), r(t), u(t), L(t)

import { G } from "./config.js";

const TIME_WINDOW_HOURS = 48;

// div containers
let energyDiv = null;
let radiusDiv = null;
let velDiv = null;
let brightDiv = null;

// uPlot instances
let energyPlot = null;
let radiusPlot = null;
let velPlot = null;
let brightPlot = null;

// Για την ανίχνευση διελεύσεων στη φωτεινότητα
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

// ===== helpers για χρόνο & παράθυρο =====
function slidingWindowRange(u, min, max) {
  if (!Number.isFinite(max)) {
    return [0, TIME_WINDOW_HOURS];
  }
  if (max < TIME_WINDOW_HOURS) {
    return [0, TIME_WINDOW_HOURS];
  }
  return [max - TIME_WINDOW_HOURS, max];
}

function formatTimeHMS(tH) {
  const totalSec = Math.round(tH * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
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

// ===== zoom / pan plugins (x-axis) =====
function wheelZoomPlugin(factor = 0.75) {
  return {
    hooks: {
      ready: (u) => {
        const over = u.over;
        over.addEventListener(
          "wheel",
          (e) => {
            e.preventDefault();

            const { left, width } = over.getBoundingClientRect();
            const x = (e.clientX - left) / width;

            const scale = u.scales.x;
            const min = scale.min ?? 0;
            const max = scale.max ?? 1;
            const range = max - min;

            const zoom = e.deltaY < 0 ? factor : 1 / factor;
            const newRange = range * zoom;

            const cx = min + range * x;
            const newMin = cx - newRange * x;
            const newMax = cx + newRange * (1 - x);

            u.setScale("x", { min: newMin, max: newMax });
          },
          { passive: false }
        );
      },
    },
  };
}

function dragPanPlugin() {
  return {
    hooks: {
      ready: (u) => {
        const over = u.over;
        let dragging = false;
        let xStart = 0;
        let minStart = 0;
        let maxStart = 0;

        over.style.cursor = "grab";

        over.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          dragging = true;
          over.style.cursor = "grabbing";
          xStart = e.clientX;
          const scale = u.scales.x;
          minStart = scale.min ?? 0;
          maxStart = scale.max ?? 1;
        });

        window.addEventListener("mousemove", (e) => {
          if (!dragging) return;
          const { width } = over.getBoundingClientRect();
          const dx = e.clientX - xStart;
          const range = maxStart - minStart;
          const du = (-dx / width) * range;
          u.setScale("x", { min: minStart + du, max: maxStart + du });
        });

        window.addEventListener("mouseup", () => {
          if (!dragging) return;
          dragging = false;
          over.style.cursor = "grab";
        });
      },
    },
  };
}

const zoomPanPlugins = [wheelZoomPlugin(), dragPanPlugin()];

// ===== PNG export button =====
function attachDownloadButton(u, container, filename) {
  const btn = document.createElement("button");
  btn.className = "chart-download-btn";
  btn.type = "button";
  btn.textContent = "PNG";

  btn.addEventListener("click", () => {
    const canvas = u.root.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
  });

  container.appendChild(btn);
}

// ===== δημιουργία επιμέρους plots (lazy) =====
function createEnergyPlot() {
  if (!energyDiv || typeof uPlot === "undefined") return;
  if (energyPlot) return;

  const rect = energyDiv.getBoundingClientRect();

  energyPlot = new uPlot(
    {
      width: rect.width || 320,
      height: rect.height || 220,
      scales: {
        x: { range: slidingWindowRange, time: false },
        y: { auto: true },
      },
      series: [
        {}, // x
        { label: "E", stroke: "#3ddc97", width: 2 },
        { label: "K", stroke: "#f4a261", width: 1.5 },
        { label: "U", stroke: "#00b4d8", width: 1.5 },
      ],
      axes: [
        {
          label: "t (h:m:s)",
          values: (u, vals) => vals.map((v) => formatTimeHMS(v)),
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
        {
          label: "E (J/kg)",
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
      ],
      plugins: zoomPanPlugins,
      padding: [10, 16, 28, 8], // extra κάτω περιθώριο
    },
    [energyX, energyTotal, energyKin, energyPot],
    energyDiv
  );

  attachDownloadButton(energyPlot, energyDiv, "energy");
}

function createRadiusPlot() {
  if (!radiusDiv || typeof uPlot === "undefined") return;
  if (radiusPlot) return;

  const rect = radiusDiv.getBoundingClientRect();

  radiusPlot = new uPlot(
    {
      width: rect.width || 320,
      height: rect.height || 220,
      scales: {
        x: { range: slidingWindowRange, time: false },
        y: { auto: true },
      },
      series: [
        {},
        {
          label: "r",
          stroke: "#ff006e",
          width: 2,
        },
      ],
      axes: [
        {
          label: "t (h:m:s)",
          values: (u, vals) => vals.map((v) => formatTimeHMS(v)),
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
        {
          label: "r (m)",
          values: (u, vals) => vals.map((v) => v.toFixed(3)),
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
      ],
      plugins: zoomPanPlugins,
      padding: [10, 16, 28, 8],
    },
    [radiusX, radiusY],
    radiusDiv
  );

  attachDownloadButton(radiusPlot, radiusDiv, "radius");
}

function createVelPlot() {
  if (!velDiv || typeof uPlot === "undefined") return;
  if (velPlot) return;

  const rect = velDiv.getBoundingClientRect();

  velPlot = new uPlot(
    {
      width: rect.width || 320,
      height: rect.height || 220,
      scales: {
        x: { range: slidingWindowRange, time: false },
        y: { auto: true },
      },
      series: [
        {},
        {
          label: "u",
          stroke: "#4361ee",
          width: 2,
        },
      ],
      axes: [
        {
          label: "t (h:m:s)",
          values: (u, vals) => vals.map((v) => formatTimeHMS(v)),
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
        {
          label: "u (m/s)",
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
      ],
      plugins: zoomPanPlugins,
      padding: [10, 16, 28, 8],
    },
    [velX, velY],
    velDiv
  );

  attachDownloadButton(velPlot, velDiv, "speed");
}

function createBrightPlot() {
  if (!brightDiv || typeof uPlot === "undefined") return;
  if (brightPlot) return;

  const rect = brightDiv.getBoundingClientRect();

  brightPlot = new uPlot(
    {
      width: rect.width || 320,
      height: rect.height || 220,
      scales: {
        x: { range: slidingWindowRange, time: false },
        y: {
          range: () => [0.9, 1.1],
        },
      },
      series: [
        {},
        {
          label: "L",
          stroke: "#ff9f1c",
          width: 2,
        },
      ],
      axes: [
        {
          label: "t (h:m:s)",
          values: (u, vals) => vals.map((v) => formatTimeHMS(v)),
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
        {
          label: "L (%)",
          values: (u, vals) => vals.map((v) => (v * 100).toFixed(0) + "%"),
          grid: { stroke: "rgba(255,255,255,0.1)" },
        },
      ],
      plugins: zoomPanPlugins,
      padding: [10, 16, 28, 8],
    },
    [brightX, brightY],
    brightDiv
  );

  attachDownloadButton(brightPlot, brightDiv, "brightness");
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
    energyTotal.push(Number(E.toFixed(5)));
    energyKin.push(Number(K.toFixed(5)));
    energyPot.push(Number(U.toFixed(5)));
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

  createEnergyPlot();
}

function updateAllPlots() {
  trimAll();

  if (energyPlot) {
    energyPlot.setData([energyX, energyTotal, energyKin, energyPot]);
  }
  if (radiusPlot) {
    radiusPlot.setData([radiusX, radiusY]);
  }
  if (velPlot) {
    velPlot.setData([velX, velY]);
  }
  if (brightPlot) {
    brightPlot.setData([brightX, brightY]);
  }
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
  if (redrawCounter % REDRAW_EVERY !== 0) {
    return;
  }

  updateAllPlots();
}

export function resizeCharts() {
  if (typeof uPlot === "undefined") return;

  if (energyDiv && energyDiv.offsetParent !== null) {
    if (!energyPlot) createEnergyPlot();
    const rect = energyDiv.getBoundingClientRect();
    if (energyPlot) {
      energyPlot.setSize({
        width: rect.width || 320,
        height: rect.height || 220,
      });
    }
  }

  if (radiusDiv && radiusDiv.offsetParent !== null) {
    if (!radiusPlot) createRadiusPlot();
    const rect = radiusDiv.getBoundingClientRect();
    if (radiusPlot) {
      radiusPlot.setSize({
        width: rect.width || 320,
        height: rect.height || 220,
      });
    }
  }

  if (velDiv && velDiv.offsetParent !== null) {
    if (!velPlot) createVelPlot();
    const rect = velDiv.getBoundingClientRect();
    if (velPlot) {
      velPlot.setSize({
        width: rect.width || 320,
        height: rect.height || 220,
      });
    }
  }

  if (brightDiv && brightDiv.offsetParent !== null) {
    if (!brightPlot) createBrightPlot();
    const rect = brightDiv.getBoundingClientRect();
    if (brightPlot) {
      brightPlot.setSize({
        width: rect.width || 320,
        height: rect.height || 220,
      });
    }
  }
}
