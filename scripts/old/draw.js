// draw.js
// Όλα τα γραφικά: πλέγμα, τροχιά, προεπισκόπηση, σώματα, διάνυσμα ταχύτητας.

// === DEBUG: σχεδίαση ΟΛΩΝ των σημείων της αριθμητικής τροχιάς ===
// γύρνα το σε true όταν θέλεις να βλέπεις όλα τα βήματα
const DEBUG_DRAW_POINTS = false;

// Μετατροπή world -> screen (λαμβάνει υπόψη zoom + pan)
function worldToScreen(state, canvas, x, y) {
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;

  // world → camera coords (αφαιρούμε το κέντρο προβολής)
  const dx = (x - state.center.x) * state.scale;
  const dy = (y - state.center.y) * state.scale;

  // camera → pixel
  return [cx + dx, cy - dy];
}

// World ακτίνα → pixel ακτίνα
function rpx(state, rWorld) {
  return Math.max(2, rWorld * state.scale);
}

export function draw(ctx, canvas, state) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

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
    let worldStep = 50;
    const minPx = 30;
    const maxPx = 120;
    while (worldStep * state.scale < minPx) worldStep *= 2;
    while (worldStep * state.scale > maxPx) worldStep /= 2;

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

  // ===== ΠΡΟΕΠΙΣΚΟΠΗΣΗ (διακεκομμένη) — ΣΧΕΔΙΑΣΗ ΑΠΟ previewPath =====
  if (state.previewPath && state.previewPath.length >= 2) {
    // ελαφρύ downsample για απόδοση
    const MAX_PREVIEW_DRAW = 4000;
    const pts = state.previewPath;
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
    ctx.strokeStyle = "rgba(110,168,254,0.7)";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ===== ΦΩΤΕΙΝΟ ΙΧΝΟΣ (trail) — χρησιμοποιεί ΕΛΑΦΡΙΑ ουρά αν υπάρχει =====
  const trail =
    state.pathForDraw && state.pathForDraw.length >= 2
      ? state.pathForDraw
      : state.path && state.path.length >= 2
      ? state.path
      : null;

  if (trail) {
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
    const R_M_world = state.crashR || 6; // ίδιο με την ακτίνα πρόσκρουσης (σε world units)
    const Rpx = rpx(state, R_M_world);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd166";
    ctx.shadowColor = "rgba(255,200,100,0.6)";
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
  }

  // ===== ΚΙΝΟΥΜΕΝΟ ΣΩΜΑ m =====
  {
    const [mx, my] = worldToScreen(state, canvas, state.r.x, state.r.y);

    // μικρότερο από το Μ: π.χ. 35% της crashR, με ελάχιστο 2px
    const R_m_world = Math.max((state.crashR || 6) * 0.35, 0.5);
    const Rmpx = rpx(state, R_m_world);

    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, Rmpx, 0, Math.PI * 2);
    ctx.fillStyle = "#3ddc97";
    ctx.shadowColor = "rgba(125,211,175,0.55)";
    ctx.shadowBlur = 12;
    ctx.fill();

    // λεπτό περίγραμμα
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.stroke();

    if (state.showVel) {
      const vx = state.v.x;
      const vy = state.v.y;
      const vscale = 25;
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
    }

    ctx.restore();
  }
}
