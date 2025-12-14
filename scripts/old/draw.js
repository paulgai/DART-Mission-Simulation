// draw.js
import { G, createInitialState } from "./config.js";

// Default reference force (computed from default initial values)
const __DEFAULTS__ = createInitialState();
const __FREF__ =
  (G * __DEFAULTS__.M * __DEFAULTS__.m) /
  Math.max(1e-6, __DEFAULTS__.r0 * __DEFAULTS__.r0);

function __clamp__(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Όλα τα γραφικά: πλέγμα, τροχιά, προεπισκόπηση, σώματα, διάνυσμα ταχύτητας.
// === ΕΙΚΟΝΕΣ ΣΩΜΑΤΩΝ ===
// Θέλουμε η "πηγή" να μην είναι μεγαλύτερη π.χ. από 256x256
function loadAndResizeImage(src, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    const { width, height } = img;
    const scale = maxSize / Math.max(width, height);

    // Αν ήδη είναι μικρή, μην κάνεις τίποτα
    if (scale >= 1) {
      callback(img);
      return;
    }

    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ictx = off.getContext("2d");
    ictx.imageSmoothingEnabled = true;
    ictx.imageSmoothingQuality = "medium";
    ictx.drawImage(img, 0, 0, w, h);

    const resized = new Image();
    resized.onload = () => callback(resized);
    resized.src = off.toDataURL();
  };
  img.src = src;
}

// === ΕΙΚΟΝΕΣ ΣΩΜΑΤΩΝ ===
let imgM = null;
let imgm = null;

loadAndResizeImage("scripts/img/2M.png", 256, (resized) => {
  imgM = resized;
});
loadAndResizeImage("scripts/img/2mm.png", 128, (resized) => {
  imgm = resized;
});

// Πυκνότητα σωμάτων M και m: 2.4 g/cm^3 = 2400 kg/m^3
const BODY_DENSITY = 2400; // kg/m^3

// Δεδομένης μάζας (kg) και σταθερής πυκνότητας ρ,
// ο ακτίνας σφαίρας είναι R ∝ ∛M, εδώ σε world units (m)
function diameterFromMassWorld(massKg) {
  if (!Number.isFinite(massKg) || massKg <= 0) return 0;
  const radius = Math.cbrt((3 * massKg) / (4 * Math.PI * BODY_DENSITY)); // m
  return 2 * radius; // διάμετρος σε m (ίδια με world units, αφού 1 world unit = 1 m)
}

// Από τη μάζα (kg) και σταθερή πυκνότητα ρ → ακτίνα σφαίρας σε world units (m)
// R = (3 M / (4 π ρ))^(1/3)
function getBodyRadiusFromMass(massKg, fallback = 6) {
  if (!Number.isFinite(massKg) || massKg <= 0) return fallback;
  const radius = Math.cbrt((3 * massKg) / (4 * Math.PI * BODY_DENSITY)); // m
  return radius;
}

// === DEBUG: σχεδίαση ΟΛΩΝ των σημείων της αριθμητικής τροχιάς ===
// γύρνα το σε true όταν θέλεις να βλέπεις όλα τα βήματα
const DEBUG_DRAW_POINTS = false;
// Μετατροπή world -> screen (λαμβάνει υπόψη zoom + pan)
function worldToScreen(state, canvas, x, y) {
  const dpr = window.devicePixelRatio || 1;

  // λογικό πλάτος/ύψος σε CSS pixels
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  const cx = w / 2;
  const cy = h / 2;

  // world → camera coords (αφαιρούμε το κέντρο προβολής)
  const dx = (x - state.center.x) * state.scale;
  const dy = (y - state.center.y) * state.scale;

  // camera → pixel (σε λογικές μονάδες, το dpr το έχει αναλάβει το transform)
  return [cx + dx, cy - dy];
}

// World ακτίνα → pixel ακτίνα
function rpx(state, rWorld) {
  return Math.max(2, rWorld * state.scale);
}

export function draw(ctx, canvas, state) {
  const dpr = window.devicePixelRatio || 1;

  // λογικό πλάτος/ύψος σε CSS pixels (όπως “τα βλέπει” ο κώδικας)
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.clearRect(0, 0, w, h);

  // Ελαφρύτερο resampling εικόνων
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low"; // "medium" αν σου φαίνεται πολύ «κοφτό»

  // ===== ΠΛΕΓΜΑ ΣΕ WORLD UNITS (κινείται μαζί με το pan) =====
  if (state.showGrid) {
    ctx.save();

    // Καθαρό, χωρίς glow/shadows
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "source-over";

    // λεπτές, διακριτικές γραμμές πλέγματος
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#3b4769";
    ctx.lineWidth = 1;

    // Ορατά όρια σε μονάδες χώρου γύρω από το center
    let xMinWorld = state.center.x - w / (2 * state.scale);
    let xMaxWorld = state.center.x + w / (2 * state.scale);
    let yMinWorld = state.center.y - h / (2 * state.scale);
    let yMaxWorld = state.center.y + h / (2 * state.scale);

    // Βήμα πλέγματος σε world units
    let worldStep = 100;

    // Κάθετες γραμμές (x = n * worldStep)
    const startX = Math.ceil(xMinWorld / worldStep) * worldStep;
    for (let xw = startX; xw <= xMaxWorld; xw += worldStep) {
      const [sx1, sy1] = worldToScreen(state, canvas, xw, yMinWorld);
      const [sx2, sy2] = worldToScreen(state, canvas, xw, yMaxWorld);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }

    // Οριζόντιες γραμμές (y = m * worldStep)
    const startY = Math.ceil(yMinWorld / worldStep) * worldStep;
    for (let yw = startY; yw <= yMaxWorld; yw += worldStep) {
      const [sx1, sy1] = worldToScreen(state, canvas, xMinWorld, yw);
      const [sx2, sy2] = worldToScreen(state, canvas, xMaxWorld, yw);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }

    // Άξονες x,y στο world (x=0, y=0)
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#54639a";
    ctx.lineWidth = 1.2;

    // x-axis (y=0)
    {
      const [sx1, sy1] = worldToScreen(state, canvas, xMinWorld, 0);
      const [sx2, sy2] = worldToScreen(state, canvas, xMaxWorld, 0);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
    // y-axis (x=0)
    {
      const [sx1, sy1] = worldToScreen(state, canvas, 0, yMinWorld);
      const [sx2, sy2] = worldToScreen(state, canvas, 0, yMaxWorld);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ===== ΠΡΟΕΠΙΣΚΟΠΗΣΗ (διακεκομμένη) — ΣΧΕΔΙΑΣΗ ΑΠΟ previewPath (+ ιστορικό) =====
  if (state.showPreview !== false) {
    const paths = [];

    // παλιότερες διακεκομμένες (π.χ. πριν από Impact)
    if (Array.isArray(state.previewHistory)) {
      for (const pth of state.previewHistory) {
        if (Array.isArray(pth) && pth.length >= 2)
          paths.push({ pts: pth, alpha: 0.35 });
      }
    }

    // τρέχουσα διακεκομμένη
    if (Array.isArray(state.previewPath) && state.previewPath.length >= 2) {
      paths.push({ pts: state.previewPath, alpha: 0.7 });
    }

    const drawDashed = (pts, alpha) => {
      // ελαφρύ downsample για απόδοση
      const MAX_PREVIEW_DRAW = 4000;
      const n = pts.length;
      let stride = 1;
      if (n > MAX_PREVIEW_DRAW) stride = Math.floor(n / MAX_PREVIEW_DRAW);

      ctx.beginPath();
      let first = true;
      for (let i = 0; i < n; i += stride) {
        const p = pts[i];
        const [sx, sy] = worldToScreen(state, canvas, p.x, p.y);
        if (first) {
          ctx.moveTo(sx, sy);
          first = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      // βεβαιώσου ότι περνά και το τελευταίο σημείο
      const last = pts[n - 1];
      const [sxL, syL] = worldToScreen(state, canvas, last.x, last.y);
      ctx.lineTo(sxL, syL);

      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(110,168,254,${alpha})`;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    for (const item of paths) {
      drawDashed(item.pts, item.alpha);
    }
  }

  // ===== ΦΩΤΕΙΝΟ ΙΧΝΟΣ (trail) — ΔΟΚΙΜΗ: μόνο τα πραγματικά σημεία, χωρίς downsample =====
  const trail = state.path && state.path.length >= 2 ? state.path : null;

  if (trail && state.showTrail !== false) {
    ctx.save();
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      if (!p) {
        started = false;
        continue;
      }
      const [sx, sy] = worldToScreen(state, canvas, p.x, p.y);
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    }

    if (started) {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeStyle = "#6ea8fe";
      ctx.shadowColor = "#6ea8fe";
      ctx.shadowBlur = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===== DEBUG: ΟΛΑ ΤΑ ΣΗΜΕΙΑ ΤΗΣ TRAJECTORY ΩΣ ΚΟΥΚΚΙΔΕΣ =====
  if (DEBUG_DRAW_POINTS && state.trajectory && state.trajectory.length > 0) {
    ctx.save();
    ctx.fillStyle = "#ff6b6b"; // έντονο για να ξεχωρίζει
    for (let i = 0; i < state.trajectory.length; i++) {
      const p = state.trajectory[i];
      const [sx, sy] = worldToScreen(state, canvas, p.x, p.y);
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== ΚΕΝΤΡΙΚΟ ΣΩΜΑ M =====
  {
    const [cx, cy] = worldToScreen(state, canvas, 0, 0);
    let R_M_world = state.crashR || getBodyRadiusFromMass(state.M, 6);

    // Αυτός είναι ο crash κύκλος σε pixels
    const Rpx = rpx(state, R_M_world);

    // ===== ΕΦΕ ΣΥΓΚΡΟΥΣΗΣ (ίχνος + λάμψη) =====
    if (state.impactAlpha && state.impactAlpha > 0) {
      ctx.save();

      const alpha = state.impactAlpha;

      // Σημείο σύγκρουσης σε world coords
      const x0 = state.impactX;
      const y0 = state.impactY;

      // Μήκος ίχνους σε world units
      const lengthWorld = 3000;

      const x1 = x0 - state.impactDirX * lengthWorld;
      const y1 = y0 - state.impactDirY * lengthWorld;

      const [sx0, sy0] = worldToScreen(state, canvas, x0, y0);
      const [sx1, sy1] = worldToScreen(state, canvas, x1, y1);

      // Γραμμή-ίχνος διαστημοπλοίου
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "rgba(255,255,255,0.8)";
      ctx.shadowBlur = 10;

      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      ctx.stroke();

      // Λάμψη στο σημείο σύγκρουσης
      const radiusGlow = 18;
      const gradient = ctx.createRadialGradient(
        sx0,
        sy0,
        0,
        sx0,
        sy0,
        radiusGlow
      );
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.4, `rgba(255,230,150,${0.8 * alpha})`);
      gradient.addColorStop(1, "rgba(255,230,150,0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx0, sy0, radiusGlow, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Σταδιακό σβήσιμο του εφέ
      state.impactAlpha *= 0.9;
      if (state.impactAlpha < 0.02) {
        state.impactAlpha = 0;
      }
    }

    ctx.save();

    // Δίσκος ΜΟΝΟ όταν ΔΕΝ χρησιμοποιώ εικόνες.
    // Χρώματα: M = ανοιχτό γκρι, χωρίς glow/«ομίχλη».
    if (!state.showBodyImages) {
      ctx.beginPath();
      ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
      ctx.fillStyle = "#858585ff";
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.fill();
    }

    // ΕΙΚΟΝΑ M:
    // Διαμέτρος εικόνας = διάμετρος crash κύκλου
    const sizeM = 2 * Rpx;

    if (state.showBodyImages && imgM) {
      ctx.shadowBlur = 0; // να μην «σβήνει» την εικόνα
      ctx.drawImage(imgM, cx - sizeM / 2, cy - sizeM / 2, sizeM, sizeM);
    }

    ctx.restore();
  }

  // ===== ΚΙΝΟΥΜΕΝΟ ΣΩΜΑ m =====
  {
    const [mx, my] = worldToScreen(state, canvas, state.r.x, state.r.y);

    ctx.save();

    // ΕΙΚΟΝΑ m: διάμετρος από τη μάζα (R ∝ ∛m, ρ = 2.4 g/cm³)
    let diameterWorldm = diameterFromMassWorld(state.m);

    // Fallback αν κάτι πάει στραβά
    if (!Number.isFinite(diameterWorldm) || diameterWorldm <= 0) {
      diameterWorldm = 160; // περίπου όσο πριν
    }

    const radiusPxm = rpx(state, diameterWorldm / 2);
    const sizem = radiusPxm * 2;

    if (state.showBodyImages && imgm) {
      ctx.shadowColor = "rgba(125,211,175,0.55)";
      ctx.shadowBlur = 0;
      ctx.drawImage(imgm, mx - sizem / 2, my - sizem / 2, sizem, sizem);
    } else {
      // Fallback: χρωματιστός δίσκος (ίδιου μεγέθους με το εικονίδιο)
      // Χρώματα: m = σκούρο γκρι, χωρίς glow/«ομίχλη».
      ctx.beginPath();
      ctx.arc(mx, my, radiusPxm, 0, Math.PI * 2);
      ctx.fillStyle = "#5f5f5f";
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.fill();

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();
    }

    // === Διάνυσμα ταχύτητας όπως πριν ===
    if (state.showVel) {
      const vx = state.v.x;
      const vy = state.v.y;
      const vscale = 150;
      const ex = mx + vx * vscale;
      const ey = my - vy * vscale;

      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "#9be7c7";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const ang = Math.atan2(my - ey, ex - mx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 8 * Math.cos(ang - 0.3), ey + 8 * Math.sin(ang - 0.3));
      ctx.lineTo(ex - 8 * Math.cos(ang + 0.3), ey + 8 * Math.sin(ang + 0.3));
      ctx.closePath();
      ctx.fillStyle = "#9be7c7";
      ctx.fill();

      const vang = Math.atan2(ey - my, ex - mx);
      const off = 12;
      const lx = ex + off * Math.cos(vang);
      const ly = ey + off * Math.sin(vang);

      ctx.font = "12px Arial";
      ctx.fillStyle = "#9be7c7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("u", lx, ly);
    }

    // === Γραμμή απόστασης M–m όπως πριν ===
    if (state.showDistance) {
      const [sxM, syM] = worldToScreen(state, canvas, 0, 0);

      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#3dffb3";
      const oldAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.9;

      ctx.moveTo(sxM, syM);
      ctx.lineTo(mx, my);
      ctx.stroke();

      const midx = 0.5 * (sxM + mx);
      const midy = 0.5 * (syM + my);

      let nx = my - syM;
      let ny = -(mx - sxM);
      const nlen = Math.hypot(nx, ny) || 1;
      const off = 10;
      nx = (nx / nlen) * off;
      ny = (ny / nlen) * off;

      ctx.font = "12px Arial";
      ctx.fillStyle = "#3dffb3";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("r", midx + nx, midy + ny);

      ctx.setLineDash([]);
      ctx.globalAlpha = oldAlpha;
    }

    ctx.restore();
  }

  // Διανύσματα βαρυτικών δυνάμεων (ίσου μέτρου, αντίθετης φοράς)
  if (state.showForces && state.r) {
    const rx = state.r.x;
    const ry = state.r.y;
    const rMag = Math.hypot(rx, ry);

    if (rMag > 1e-6) {
      // θέσεις σε pixels
      const [sxM, syM] = worldToScreen(state, canvas, 0, 0); // M
      const [mx, my] = worldToScreen(state, canvas, rx, ry); // m

      const dxs = sxM - mx;
      const dys = syM - my;
      const rScreen = Math.hypot(dxs, dys);
      if (rScreen < 1e-3) return;

      // μοναδιαίο διάνυσμα (m -> M) σε pixels
      const ux = dxs / rScreen;
      const uy = dys / rScreen;

      // μήκος βέλους σε pixels (εξαρτάται από F = G M m / r^2, αλλά κρατιέται "ορατό")
      const baseLen = 70;
      const Fmag = (G * state.M * state.m) / Math.max(1e-6, rMag * rMag);
      // κλιμάκωση σε σχέση με τις default τιμές (ώστε να φαίνεται η μεταβολή σε μάζες/απόσταση)
      const s = Math.sqrt(Fmag / __FREF__);
      const Lraw = baseLen * __clamp__(s, 0.15, 3.0);
      const Lpx = __clamp__(Math.min(Lraw, rScreen * 0.6), 10, 220); // ==== Δύναμη στο m (προς M) ====
      {
        const tx = mx + ux * Lpx;
        const ty = my + uy * Lpx;

        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = "#ffb703";
        ctx.lineWidth = 2;
        ctx.stroke();

        const ang = Math.atan2(ty - my, tx - mx);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 8 * Math.cos(ang - 0.3), ty - 8 * Math.sin(ang - 0.3));
        ctx.lineTo(tx - 8 * Math.cos(ang + 0.3), ty - 8 * Math.sin(ang + 0.3));
        ctx.closePath();
        ctx.fillStyle = "#ffb703";
        ctx.fill();

        // label "F" στην άκρη του διανύσματος
        const off = 10;
        const lx = tx + ux * off;
        const ly = ty + uy * off;
        ctx.font = "11px Arial";
        ctx.fillStyle = "#ffb703";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("F", lx, ly);
      }

      // ==== Δύναμη στο M (προς m, αντίθετης φοράς) ====
      {
        const txM = sxM - ux * Lpx;
        const tyM = syM - uy * Lpx;

        ctx.beginPath();
        ctx.moveTo(sxM, syM);
        ctx.lineTo(txM, tyM);
        ctx.strokeStyle = "#ffb703";
        ctx.lineWidth = 2;
        ctx.stroke();

        const angM = Math.atan2(tyM - syM, txM - sxM);
        ctx.beginPath();
        ctx.moveTo(txM, tyM);
        ctx.lineTo(
          txM - 8 * Math.cos(angM - 0.3),
          tyM - 8 * Math.sin(angM - 0.3)
        );
        ctx.lineTo(
          txM - 8 * Math.cos(angM + 0.3),
          tyM - 8 * Math.sin(angM + 0.3)
        );
        ctx.closePath();
        ctx.fillStyle = "#ffb703";
        ctx.fill();

        // label "F" και εδώ
        const off = 10;
        const lx2 = txM - ux * off;
        const ly2 = tyM - uy * off;
        ctx.font = "11px Arial";
        ctx.fillStyle = "#ffb703";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("F", lx2, ly2);
      }
    }
  }

  // ===== ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ ΚΛΕΙΣΤΗΣ ΤΡΟΧΙΑΣ (a, b, κέντρο, εστίες) =====
  if (state.showClosedGeom && state.ellipseGeom) {
    const eg = state.ellipseGeom;
    const C = eg.center || { x: 0, y: 0 };
    const a = eg.a;
    const b = eg.b;

    const eEst =
      Number.isFinite(a) && Number.isFinite(b) && a > 0
        ? Math.sqrt(Math.max(0, 1 - Math.min(a, b) ** 2 / Math.max(a, b) ** 2))
        : NaN;

    // NOTE: Η ταξινόμηση "circle" στο physics.js είναι πολύ αυστηρή (EPS_ECIRC=1e-4).
    // Για το overlay γεωμετρίας, θεωρούμε "κύκλο" και πολύ μικρές εκκεντρότητες ώστε
    // να εμφανίζονται κέντρο + ακτίνα όταν η τροχιά είναι πρακτικά κυκλική.
    const isCircle = Number.isFinite(eEst)
      ? eEst <= 0.02
      : Number.isFinite(a) &&
        Number.isFinite(b) &&
        Math.abs(a - b) <= 1e-4 * Math.max(1, a);

    ctx.save();

    // κοινό στυλ
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (isCircle) {
      // ===== ΚΥΚΛΟΣ: κέντρο + ακτίνα =====
      // Σε κυκλική τροχιά, το κέντρο συμπίπτει με την εστία (M) στο (0,0)
      const C0 = { x: 0, y: 0 };
      const [sxC, syC] = worldToScreen(state, canvas, C0.x, C0.y);

      // marker κέντρου
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sxC, syC, 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff9f1c";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText("C", sxC, syC - 12);

      // ακτίνα (από το κέντρο προς τα δεξιά)
      const P = { x: C0.x + a, y: C0.y };
      const [sxP, syP] = worldToScreen(state, canvas, P.x, P.y);

      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sxC, syC);
      ctx.lineTo(sxP, syP);
      ctx.stroke();
      ctx.setLineDash([]);

      // label R
      const midx = 0.5 * (sxC + sxP);
      const midy = 0.5 * (syC + syP);
      ctx.fillText("R", midx, midy - 12);

      // μικρό text με αριθμητική τιμή
      ctx.fillText(`R = ${a.toFixed(1)}`, sxC, syC + 18);

      // και ένα πιο «σίγουρο» label στη γωνία (αν το κέντρο είναι εκτός κάδρου)
      ctx.fillText(`C = (0,0), R = ${a.toFixed(1)}`, 120, 20);
    } else {
      // ===== ΕΛΛΕΙΨΗ: a, b, κέντρο, εστίες =====

      // διεύθυνση κύριου άξονα: από εστία στο M (0,0) προς τη δεύτερη εστία
      let ux =
        eg.focus2 && Number.isFinite(eg.focus2.x) ? eg.focus2.x : 2 * C.x;
      let uy =
        eg.focus2 && Number.isFinite(eg.focus2.y) ? eg.focus2.y : 2 * C.y;
      let len = Math.hypot(ux, uy);

      if (len > 1e-12) {
        ux /= len;
        uy /= len;
      } else {
        ux = 1;
        uy = 0;
      }

      // κάθετος (μικρός) άξονας
      const vx = -uy;
      const vy = ux;

      // ημιάξονες (από το κέντρο προς μία άκρη)
      const A2 = { x: C.x + a * ux, y: C.y + a * uy };
      const B2 = { x: C.x + b * vx, y: C.y + b * vy };

      // σχεδίαση ημιάξονων
      {
        const [sx1, sy1] = worldToScreen(state, canvas, C.x, C.y);
        const [sx2, sy2] = worldToScreen(state, canvas, A2.x, A2.y);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
        // label a
        ctx.setLineDash([]);
        ctx.fillText("a", 0.5 * (sx1 + sx2), 0.5 * (sy1 + sy2) - 12);
        ctx.setLineDash([5, 4]);
      }
      {
        const [sx1, sy1] = worldToScreen(state, canvas, C.x, C.y);
        const [sx2, sy2] = worldToScreen(state, canvas, B2.x, B2.y);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
        // label b
        ctx.setLineDash([]);
        ctx.fillText("b", 0.5 * (sx1 + sx2) + 12, 0.5 * (sy1 + sy2));
        ctx.setLineDash([5, 4]);
      }

      ctx.setLineDash([]);

      // marker κέντρου
      {
        // Σε κυκλική τροχιά, το κέντρο συμπίπτει με την εστία (M) στο (0,0)
        const C0 = { x: 0, y: 0 };
        const [sxC, syC] = worldToScreen(state, canvas, C0.x, C0.y);
        ctx.beginPath();
        ctx.arc(sxC, syC, 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff9f1c";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText("C", sxC, syC - 12);
      }

      // εστία στο M (0,0)
      {
        const [sxF1, syF1] = worldToScreen(state, canvas, 0, 0);
        ctx.beginPath();
        ctx.arc(sxF1, syF1, 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff9f1c";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // δεύτερη εστία
      if (eg.focus2) {
        const [sxF2, syF2] = worldToScreen(
          state,
          canvas,
          eg.focus2.x,
          eg.focus2.y
        );
        ctx.beginPath();
        ctx.arc(sxF2, syF2, 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff9f1c";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // μικρό text με αριθμητικές τιμές
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "11px Arial";
      ctx.fillText(`a = ${a.toFixed(1)}, b = ${b.toFixed(1)}`, 90, 20);
    }

    ctx.restore();
  }
  // ===== Εργαλείο μέτρησης (2 σημεία + ευθύγραμμο τμήμα + απόσταση) =====
  if (
    state.showMeasure &&
    state.measureTool &&
    state.measureTool.p1 &&
    state.measureTool.p2
  ) {
    const p1 = state.measureTool.p1;
    const p2 = state.measureTool.p2;

    const [x1, y1] = worldToScreen(state, canvas, p1.x, p1.y);
    const [x2, y2] = worldToScreen(state, canvas, p2.x, p2.y);

    // γραμμή
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(61,255,179,0.9)";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // άκρα (draggable handles)
    const r = 6;
    for (const [sx, sy] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10,20,20,0.75)";
      ctx.fill();
      ctx.strokeStyle = "rgba(61,255,179,1)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // label απόστασης στο μέσο
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);

    let label = "—";
    if (Number.isFinite(d)) {
      if (d >= 1000) label = `${(d / 1000).toFixed(2)} km`;
      else label = `${d.toFixed(1)} m`;
    }

    const mx = 0.5 * (x1 + x2);
    const my = 0.5 * (y1 + y2);

    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // background για να διαβάζεται πάνω σε γραμμές/πλέγμα
    const padX = 6;
    const padY = 4;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(
      mx - tw / 2 - padX,
      my - 8 - padY,
      tw + 2 * padX,
      16 + 2 * padY
    );

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(label, mx, my);

    ctx.restore();
  }
}
