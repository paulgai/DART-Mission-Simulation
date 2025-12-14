// charts.js – Apache ECharts + zoom/pan + save image (toolbox)
// Γραφήματα: E(t), K(t), U(t), r(t), u(t), L(t)

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
const RADIUS_Y_MIN_SPAN = 10.0; // τουλάχιστον 10 m στην απόσταση

// ===== Time-axis windowing (sliding x-range) =====
// Θέλουμε στον άξονα χρόνου (ώρες):
// [0, T1], και όταν t >= T1 → [T1-D, 2T1-D], όταν t >= 2T1-D → [2T1-2D, 3T1-D], κ.ο.κ.
// Με T1=10h και D=2h προκύπτουν: [0,10], [8,18], [16,28], ...
const TIME_WINDOW_T1 = 10; // ώρες
const TIME_WINDOW_D = 2;  // ώρες
const TIME_WINDOW_STEP = TIME_WINDOW_T1 - TIME_WINDOW_D; // T1-D

// Μέγιστο όριο άξονα x (ώρες). Δεν το μειώνουμε ποτέ, μόνο το μεγαλώνουμε,
// ώστε να μπορούμε να κάνουμε pan πίσω στο ιστορικό.
let xAxisMaxHours = TIME_WINDOW_T1;

// Θυμόμαστε ποιο «βηματικό» παράθυρο είναι ενεργό, ώστε:
// - να μην «πολεμάμε» το pan του χρήστη σε κάθε frame
// - αλλά να μετακινούμε αυτόματα το παράθυρο όταν αλλάζει το k
let lastTimeWindowKey = null;

// Τρέχον ορατό παράθυρο στον άξονα χρόνου (για y-autofit στο visible window)
let currentXView = { min: 0, max: TIME_WINDOW_T1 };

function computeTimeWindowHours(t) {
  const T1 = TIME_WINDOW_T1;
  const D = TIME_WINDOW_D;

  if (!Number.isFinite(t) || t < T1) {
    return { k: 0, min: 0, max: T1 };
  }

  // Safety: αν κάποιος βάλει D>=T1, μην "σκάσει" η λογική
  if (!Number.isFinite(D) || !Number.isFinite(T1) || T1 <= 0 || D >= T1) {
    return { k: 0, min: 0, max: Math.max(T1 || 0, t) };
  }

  // Θέλουμε αλλαγή παραθύρου στα όρια: T1, (2T1-D), (3T1-D), ...
  // Για t>=T1, ο δείκτης k δίνεται από: k = floor((t + D)/T1)  (k=1 στο t=T1)
  const k = Math.floor((t + D) / T1); // 1,2,3,...

  const min = k * (T1 - D);     // 0, (T1-D), 2(T1-D), ...
  const max = (k + 1) * T1 - D; // T1, (2T1-D), (3T1-D), ...

  return { k, min, max };
}





// ===== X-axis sync (pan/zoom κοινό σε όλα τα γραφήματα) =====
// Χρησιμοποιούμε echarts.connect ώστε όταν κάνεις pan/zoom σε ένα γράφημα,
// να μετακινούνται ΟΛΑ τα γραφήματα μαζί (ίδιος άξονας χρόνου).
const CHARTS_GROUP = "dart-charts-group";


// ===== Download image: ΜΟΝΟ το τρέχον γράφημα =====
// Το built-in toolbox saveAsImage σε connected charts μπορεί να προκαλέσει πολλαπλά downloads.
// Χρησιμοποιούμε custom toolbox button που καλεί plot.getDataURL() μόνο για το συγκεκριμένο instance.
const DOWNLOAD_ICON_PATH =
  "path://M512 64c-17.7 0-32 14.3-32 32v224H352c-12.9 0-24.6 7.8-29.6 19.7-5 11.9-2.2 25.6 7.1 34.7l160 160c12.5 12.5 32.8 12.5 45.3 0l160-160c9.3-9.1 12.1-22.8 7.1-34.7C696.6 327.8 684.9 320 672 320H544V96c0-17.7-14.3-32-32-32zm-320 640c-17.7 0-32 14.3-32 32v64c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32v-64c0-17.7-14.3-32-32-32H192z";

function downloadCurrentChart(plot, label) {
  if (!plot) return;
  // ISO timestamp χωρίς ':' για Windows filename compatibility
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safeLabel = String(label || "chart").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const filename = `DART_${safeLabel}_${ts}.png`;

  const url = plot.getDataURL({
    type: "png",
    pixelRatio: 4,
    backgroundColor: "#0b1020",
    excludeComponents: ["toolbox"], // μην φαίνονται τα εικονίδια στο export
  });

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function installSingleChartDownloadTool(plot, label) {
  if (!plot) return;
  plot.setOption({
    toolbox: {
      feature: {
        // Κρύψε το default, για να μη «τρέχει» σε connected charts
        saveAsImage: { show: false },
        // Κράτα το dataZoom όπως πριν
        dataZoom: { yAxisIndex: "none" },
        // Custom download
        mySave: {
          show: true,
          title: "Download image",
          icon: DOWNLOAD_ICON_PATH,
          onclick: () => downloadCurrentChart(plot, label),
        },
      },
    },
  });
}


function connectPlotToGroup(plot) {
  if (!plot || typeof echarts === "undefined") return;
  plot.group = CHARTS_GROUP;
  try {
    echarts.connect(CHARTS_GROUP);
  } catch (_) {}
}

let suppressUserDataZoomEvent = false;

// ===== Y-axis autofit on pan/zoom =====
// Όταν ο χρήστης κάνει pan/zoom στον άξονα x, κάνουμε άμεσα autofit στον y
// με βάση *ΜΟΝΟ* τα ορατά δεδομένα.
// Το datazoom event πυροδοτείται πολύ συχνά, οπότε κάνουμε throttle με rAF.
let yFitRaf = 0;
let pendingYFitWin = null;

function applyYAutoFitToAllPlots(xWin) {
  const win = xWin || currentXView;
  if (!win) return;

  const setY = (plot, span) => {
    if (!plot) return;
    plot.setOption(
      {
        yAxis: span ? { min: span.min, max: span.max } : { min: "dataMin", max: "dataMax" },
      },
      { notMerge: false, lazyUpdate: true }
    );
  };

  // Ενέργειες
  setY(
    energyEPlot,
    energyEPlot
      ? computeSpanWithMinInRange(energyX, energyTotal, win.min, win.max, ENERGY_Y_MIN_SPAN)
      : null
  );
  setY(
    energyKPlot,
    energyKPlot
      ? computeSpanWithMinInRange(energyX, energyKin, win.min, win.max, ENERGY_Y_MIN_SPAN)
      : null
  );
  setY(
    energyUPlot,
    energyUPlot
      ? computeSpanWithMinInRange(energyX, energyPot, win.min, win.max, ENERGY_Y_MIN_SPAN)
      : null
  );

  // Απόσταση / Ταχύτητα
  setY(
    radiusPlot,
    radiusPlot
      ? computeSpanWithMinInRange(radiusX, radiusY, win.min, win.max, RADIUS_Y_MIN_SPAN)
      : null
  );
  setY(
    velPlot,
    velPlot ? computeSpanWithMinInRange(velX, velY, win.min, win.max, SPEED_Y_MIN_SPAN) : null
  );

  // Brightness: fixed range, άρα δεν κάνουμε τίποτα.
}

function scheduleYAutoFit(xWin) {
  const win = xWin || currentXView;
  if (!win) return;
  pendingYFitWin = win; // κράτα το πιο πρόσφατο range
  if (yFitRaf) return;
  yFitRaf = requestAnimationFrame(() => {
    yFitRaf = 0;
    applyYAutoFitToAllPlots(pendingYFitWin || currentXView);
  });
}

// Διάβασε το τρέχον x-range από το dataZoom ενός plot (ώρες).
function getXRangeFromPlot(plot) {
  if (!plot) return null;
  try {
    const opt = plot.getOption ? plot.getOption() : null;
    const dz = opt && opt.dataZoom && opt.dataZoom[0] ? opt.dataZoom[0] : null;
    const xa = opt && opt.xAxis && opt.xAxis[0] ? opt.xAxis[0] : null;

    const axisMin =
      xa && typeof xa.min === "number" ? xa.min : 0;
    const axisMax =
      xa && typeof xa.max === "number" ? xa.max : xAxisMaxHours;

    // προτιμάμε startValue/endValue (είναι «σε μονάδες», όχι %)
    const sv = dz ? dz.startValue : null;
    const ev = dz ? dz.endValue : null;
    if (typeof sv === "number" && typeof ev === "number") {
      return { min: sv, max: ev };
    }

    // fallback: start/end σε %
    const s = dz ? dz.start : null;
    const e = dz ? dz.end : null;
    if (typeof s === "number" && typeof e === "number") {
      const a = axisMin + ((axisMax - axisMin) * s) / 100;
      const b = axisMin + ((axisMax - axisMin) * e) / 100;
      return { min: a, max: b };
    }
  } catch (_) {}
  return null;
}

function applyXWindowToPlot(plot, min, max) {
  if (!plot) return;
  suppressUserDataZoomEvent = true;
  // dataZoomIndex: 0 (το "inside")
  plot.dispatchAction({
    type: "dataZoom",
    dataZoomIndex: 0,
    startValue: min,
    endValue: max,
  });
  suppressUserDataZoomEvent = false;

  // ενημέρωσε το τρέχον ορατό x-window (χρησιμοποιείται για y-autofit)
  currentXView = { min, max };
}

function applyXWindowToAllPlots(min, max) {
  applyXWindowToPlot(energyEPlot, min, max);
  applyXWindowToPlot(energyKPlot, min, max);
  applyXWindowToPlot(energyUPlot, min, max);
  applyXWindowToPlot(radiusPlot,  min, max);
  applyXWindowToPlot(velPlot,     min, max);
  applyXWindowToPlot(brightPlot,  min, max);
}

// div containers
let energyEDiv = null;
let energyKDiv = null;
let energyUDiv = null;
let radiusDiv = null;
let velDiv = null;
let brightDiv = null;

// ECharts instances
let energyEPlot = null;
let energyKPlot = null;
let energyUPlot = null;
let radiusPlot = null;
let velPlot = null;
let brightPlot = null;


// Impact markers (κάθετες γραμμές στο χρόνο κρούσης) – x σε ώρες
// Κάθε φορά που πατάμε Impact, προσθέτουμε νέο marker ώστε να φαίνεται το ιστορικό κρούσεων.
let impactTimesHours = [];

function impactMarkLine() {
  // ECharts markLine: κάθετες γραμμές στα x = impactTimesHours
  if (!impactTimesHours.length) return { data: [] };
  return {
    silent: true,
    symbol: ["none", "none"],
    zlevel: 0,
    z: 0,
    label: { show: false },
    lineStyle: { color: "red", type: "dashed", width: 1 },
    emphasis: { disabled: true },
    data: impactTimesHours.map((t) => ({ xAxis: t })),
  };
}

export function setImpactTime(tHours) {
  // Backwards compatible name: πλέον *προσθέτει* νέο marker, δεν μετακινεί τον προηγούμενο.
  const t = Number.isFinite(tHours) ? tHours : null;
  if (t === null) return;

  const last = impactTimesHours.length
    ? impactTimesHours[impactTimesHours.length - 1]
    : null;
  // Αν πατηθεί πολλές φορές στο ίδιο ακριβώς t, μην το διπλο-γράφεις.
  if (last !== null && Math.abs(last - t) < 1e-9) return;

  impactTimesHours.push(t);

  // Safety: κράτα μόνο τις πιο πρόσφατες (να μη βαραίνει άσκοπα)
  const MAX_IMPACTS = 50;
  if (impactTimesHours.length > MAX_IMPACTS) {
    impactTimesHours.splice(0, impactTimesHours.length - MAX_IMPACTS);
  }

  updateAllPlots();
}

export function clearImpactTimes() {
  impactTimesHours = [];
  updateAllPlots();
}


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
    // Χωρίς animation, ώστε οι αλλαγές παραθύρου/zoom να εφαρμόζονται άμεσα
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
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
        saveAsImage: { pixelRatio: 4 },
        dataZoom: { yAxisIndex: "none" },
      },
      iconStyle: { borderColor: "#e5e7eb" },
      emphasis: { iconStyle: { borderColor: "#ffffff" } },
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
      min: 0,
      max: xAxisMaxHours,
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

function initSingleLinePlot(div, option, seriesName) {
  if (!div || typeof echarts === "undefined") return null;
  const plot = echarts.init(div);
  // Σύνδεσε όλα τα plots σε κοινό group, ώστε pan/zoom σε ένα γράφημα
  // να συγχρονίζει αυτόματα τον άξονα x σε όλα.
  connectPlotToGroup(plot);
  option.series = [
    {
      name: seriesName,
      type: "line",
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2 },
      data: [],
      z: 2,
    },
  ];
  plot.setOption(option);

  // Custom download (μόνο αυτό το chart)
  installSingleChartDownloadTool(plot, seriesName);

  // Όταν ο χρήστης κάνει pan/zoom (dataZoom), κράτα το τρέχον x-range
  // ώστε να κάνουμε y-autofit ΜΟΝΟ στα ορατά δεδομένα.
  plot.on("datazoom", () => {
    if (suppressUserDataZoomEvent) return;
    const r = getXRangeFromPlot(plot);
    if (r) {
      currentXView = r;
      // Άμεσο y-autofit στο ορατό window όταν ο χρήστης κάνει pan/zoom
      scheduleYAutoFit(r);
    }
  });

  // Εφάρμοσε το τρέχον «βηματικό» παράθυρο στο plot που μόλις δημιουργήθηκε.
  const tw = computeTimeWindowHours(tHours);
  if (tw) applyXWindowToPlot(plot, tw.min, tw.max);
  return plot;
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

// helper: min/max + minSpan ΜΟΝΟ για σημεία που είναι μέσα στο ορατό x-range
function computeSpanWithMinInRange(xArr, yArr, xMin, xMax, minSpan) {
  let min = Infinity;
  let max = -Infinity;

  const n = Math.min(xArr.length, yArr.length);
  for (let i = 0; i < n; i++) {
    const x = xArr[i];
    const y = yArr[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < xMin || x > xMax) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }

  // αν στο window δεν βρέθηκαν σημεία (π.χ. άδειο range), κάνε fallback σε όλη τη σειρά
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return computeSpanWithMin(yArr, minSpan);
  }

  let span = max - min;
  if (span < minSpan) {
    const mid = 0.5 * (min + max);
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  return { min, max };
}

// ===== δημιουργία γραφημάτων (on-demand) =====
function createEnergyEPlot() {
  if (energyEPlot) return;
  if (!energyEDiv) energyEDiv = document.getElementById("energyEChart");
  const opt = baseChartOption({
    yName: "E (J/kg)",
    yMinInterval: 0.001,
    yFormatter: (v) => v.toFixed(ENERGY_AXIS_DECIMALS),
  });
  energyEPlot = initSingleLinePlot(energyEDiv, opt, "E");
}

function createEnergyKPlot() {
  if (energyKPlot) return;
  if (!energyKDiv) energyKDiv = document.getElementById("energyKChart");
  const opt = baseChartOption({
    yName: "K (J/kg)",
    yMinInterval: 0.001,
    yFormatter: (v) => v.toFixed(ENERGY_AXIS_DECIMALS),
  });
  energyKPlot = initSingleLinePlot(energyKDiv, opt, "K");
}

function createEnergyUPlot() {
  if (energyUPlot) return;
  if (!energyUDiv) energyUDiv = document.getElementById("energyUChart");
  const opt = baseChartOption({
    yName: "U (J/kg)",
    yMinInterval: 0.001,
    yFormatter: (v) => v.toFixed(ENERGY_AXIS_DECIMALS),
  });
  energyUPlot = initSingleLinePlot(energyUDiv, opt, "U");
}

function createRadiusPlot() {
  if (radiusPlot) return;
  if (!radiusDiv) radiusDiv = document.getElementById("radiusChart");
  const opt = baseChartOption({
    yName: "r (m)",
    yMinInterval: 1,
    yFormatter: (v) => v.toFixed(RADIUS_AXIS_DECIMALS),
  });
  radiusPlot = initSingleLinePlot(radiusDiv, opt, "r");
}

function createVelPlot() {
  if (velPlot) return;
  if (!velDiv) velDiv = document.getElementById("velocityChart");
  const opt = baseChartOption({
    yName: "u (m/s)",
    yMinInterval: 0.001,
    yFormatter: (v) => v.toFixed(SPEED_AXIS_DECIMALS),
  });
  velPlot = initSingleLinePlot(velDiv, opt, "u");
}

function createBrightPlot() {
  if (brightPlot) return;
  if (!brightDiv) brightDiv = document.getElementById("brightnessChart");
  const opt = baseChartOption({
    yName: "L (%)",
    yMin: 0.94,
    yMax: 1.0,
    yFormatter: (v) => (v * 100).toFixed(BRIGHT_AXIS_DECIMALS) + "%",
  });
  brightPlot = initSingleLinePlot(brightDiv, opt, "L");
}

// ===== ενημέρωση δεδομένων =====
function updateAllPlots() {
  trimAll();

  const tw = computeTimeWindowHours(tHours);
  // Μεγάλωσε το συνολικό εύρος του άξονα x ώστε να χωρά πάντα το τρέχον βηματικό παράθυρο.
  // (Αν το αφήσουμε στο extent των δεδομένων, στην αρχή "κολλάει" σε [0,1] κλπ.)
  if (tw && Number.isFinite(tw.max)) {
    xAxisMaxHours = Math.max(xAxisMaxHours, tw.max);
  }

  const xWin = currentXView || { min: tw.min, max: tw.max };

  if (energyEPlot) {
    const s = energyX.map((t, i) => [t, energyTotal[i]]);
    const span = computeSpanWithMinInRange(energyX, energyTotal, xWin.min, xWin.max, ENERGY_Y_MIN_SPAN);
    energyEPlot.setOption({
      series: [{ data: s, markLine: impactMarkLine(), z: 2 }],
      yAxis: span ? { min: span.min, max: span.max } : { min: 'dataMin', max: 'dataMax' },
    });
  }

  if (energyKPlot) {
    const s = energyX.map((t, i) => [t, energyKin[i]]);
    const span = computeSpanWithMinInRange(energyX, energyKin, xWin.min, xWin.max, ENERGY_Y_MIN_SPAN);
    energyKPlot.setOption({
      series: [{ data: s, markLine: impactMarkLine(), z: 2 }],
      yAxis: span ? { min: span.min, max: span.max } : { min: 'dataMin', max: 'dataMax' },
    });
  }

  if (energyUPlot) {
    const s = energyX.map((t, i) => [t, energyPot[i]]);
    const span = computeSpanWithMinInRange(energyX, energyPot, xWin.min, xWin.max, ENERGY_Y_MIN_SPAN);
    energyUPlot.setOption({
      series: [{ data: s, markLine: impactMarkLine(), z: 2 }],
      yAxis: span ? { min: span.min, max: span.max } : { min: 'dataMin', max: 'dataMax' },
    });
  }

  if (radiusPlot) {
    const s = radiusX.map((t, i) => [t, radiusY[i]]);
    const span = computeSpanWithMinInRange(radiusX, radiusY, xWin.min, xWin.max, RADIUS_Y_MIN_SPAN);
    radiusPlot.setOption({
      series: [{ data: s, markLine: impactMarkLine(), z: 2 }],
      yAxis: span ? { min: span.min, max: span.max } : { min: 'dataMin', max: 'dataMax' },
    });
  }

  if (velPlot) {
    const s = velX.map((t, i) => [t, velY[i]]);
    const span = computeSpanWithMinInRange(velX, velY, xWin.min, xWin.max, SPEED_Y_MIN_SPAN);
    velPlot.setOption({
      series: [{ data: s, markLine: impactMarkLine(), z: 2 }],
      yAxis: span ? { min: span.min, max: span.max } : { min: 'dataMin', max: 'dataMax' },
    });
  }

  if (brightPlot) {
    const s = brightX.map((t, i) => [t, brightY[i]]);
    // fixed y-range [0.94, 1.0]
    brightPlot.setOption({
      series: [{ data: s, markLine: impactMarkLine(), z: 2 }],
    });
  }

  // Κράτα κοινό εύρος άξονα x σε όλα τα plots (min=0, max=xAxisMaxHours),
  // ώστε το dataZoom να μπορεί να δείξει σταθερά [0,T1] από την αρχή και να επιτρέπει pan στο ιστορικό.
  const xAxisLock = { min: 0, max: xAxisMaxHours };
  if (energyEPlot) energyEPlot.setOption({ xAxis: xAxisLock }, { notMerge: false, lazyUpdate: true });
  if (energyKPlot) energyKPlot.setOption({ xAxis: xAxisLock }, { notMerge: false, lazyUpdate: true });
  if (energyUPlot) energyUPlot.setOption({ xAxis: xAxisLock }, { notMerge: false, lazyUpdate: true });
  if (radiusPlot)  radiusPlot.setOption({ xAxis: xAxisLock }, { notMerge: false, lazyUpdate: true });
  if (velPlot)     velPlot.setOption({ xAxis: xAxisLock }, { notMerge: false, lazyUpdate: true });
  if (brightPlot)  brightPlot.setOption({ xAxis: xAxisLock }, { notMerge: false, lazyUpdate: true });

  // Εφάρμοσε το «βηματικό» παράθυρο ΜΟΝΟ όταν αλλάζει το k.
  // Έτσι ο χρήστης μπορεί να κάνει pan μέσα στο ίδιο παράθυρο χωρίς να το
  // επαναφέρουμε συνεχώς, αλλά όταν έρθει η στιγμή αλλαγής διαστήματος,
  // θα μετακινηθεί αυτόματα (και μάλιστα συγχρονισμένα σε όλα τα γραφήματα).
  const twKey = String(tw?.k ?? 0);
  if (tw && twKey !== lastTimeWindowKey) {
    lastTimeWindowKey = twKey;
    applyXWindowToAllPlots(tw.min, tw.max);
    // Αμέσως μετά τη μετατόπιση του x-window, κάνε y-autofit στο νέο ορατό range
    applyYAutoFitToAllPlots({ min: tw.min, max: tw.max });
  }

}

// ===== δημόσια API =====
export function ensureChart(kind) {
  switch (kind) {
    case "E":
      createEnergyEPlot();
      break;
    case "K":
      createEnergyKPlot();
      break;
    case "U":
      createEnergyUPlot();
      break;
    case "R":
      createRadiusPlot();
      break;
    case "V":
      createVelPlot();
      break;
    case "L":
      createBrightPlot();
      break;
    default:
      break;
  }

  // Με το που δημιουργείται/εμφανίζεται, βάλε τα τρέχοντα δεδομένα.
  updateAllPlots();
}

export function initCharts(state) {
  // cache divs (αν υπάρχουν)
  energyEDiv = document.getElementById("energyEChart");
  energyKDiv = document.getElementById("energyKChart");
  energyUDiv = document.getElementById("energyUChart");
  radiusDiv = document.getElementById("radiusChart");
  velDiv = document.getElementById("velocityChart");
  brightDiv = document.getElementById("brightnessChart");

  // reset δεδομένων
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

  // Επαναφορά παραθύρου χρόνου
  xAxisMaxHours = TIME_WINDOW_T1;
  lastTimeWindowKey = null;
  currentXView = { min: 0, max: TIME_WINDOW_T1 };

  impactTimesHours = [];

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

  // Δεν δημιουργούμε plots εδώ – δημιουργούνται on-demand από ensureChart(...)
  updateAllPlots();
}

export function resetEnergySeries(state) {
  // Νέα προσομοίωση/αρχικοποίηση: καθάρισε το ιστορικό κρούσεων
  impactTimesHours = [];

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

  // Επαναφορά παραθύρου χρόνου
  xAxisMaxHours = TIME_WINDOW_T1;
  lastTimeWindowKey = null;
  currentXView = { min: 0, max: TIME_WINDOW_T1 };

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
  if (energyEPlot) energyEPlot.resize();
  if (energyKPlot) energyKPlot.resize();
  if (energyUPlot) energyUPlot.resize();
  if (radiusPlot) radiusPlot.resize();
  if (velPlot) velPlot.resize();
  if (brightPlot) brightPlot.resize();
}
