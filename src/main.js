const canvas = document.getElementById('game');
const mainCtx = canvas.getContext('2d');
// `ctx` is swappable at render time so non-focus plants can be drawn into an offscreen buffer
// (enabling a single blur + alpha pass on the whole buffer instead of per-plant).
let ctx = mainCtx;

// Lazy offscreen buffer for focus blur (null in snapshot mode where document.createElement is stubbed out).
let offCanvas = null;
let offCtx = null;
function ensureOffscreen(w, h) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  if (!offCanvas || offCanvas.width !== w || offCanvas.height !== h) {
    offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    offCtx = offCanvas.getContext('2d');
  }
  return offCanvas;
}

const ONLY_PLANT = (typeof globalThis !== 'undefined' && globalThis.ONLY_PLANT) || null;
// If SEED is provided (snapshot mode), use it for reproducibility.
// Otherwise pick a fresh entropy-based seed per page load so refresh re-randomizes.
const INITIAL_SEED = (typeof globalThis !== 'undefined' && globalThis.SEED != null)
  ? (globalThis.SEED | 0)
  : Math.floor(Math.random() * 2147483647);

// Seeded RNG — deterministic so repeated draws produce identical pixels within a session.
let _rngState = INITIAL_SEED | 0;
function seedRNG(s) { _rngState = s | 0; }
Math.random = function () {
  _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;

let hoveredKind = null;
let highlightEnabled = false;
let lastPlants = []; // [{kind, bounds, depth, render}]

// Scene-layout cache: the plants array depends only on seed + canvas size, so we only rebuild when those change.
let cachedLayout = null;

// Throttle redraws to one per animation frame; skip redundant ones during rapid input.
let pendingDraw = false;
function scheduleDraw() {
  if (typeof requestAnimationFrame !== 'function') { draw(); return; }
  if (pendingDraw) return;
  pendingDraw = true;
  requestAnimationFrame(() => { pendingDraw = false; draw(); });
}

// Smooth focus transition — when something leaves focus, it fades out rather than snapping.
let focusState = {
  currentSeed: null,
  outgoingSeed: null,
  outgoingStart: 0,
};
const OUTGOING_MS = 450;
const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

// Camera state
let panX = 0, panY = 0, zoom = 1;

// Clamp pan so the view never sees beyond the initial canvas bounds.
// At zoom z, max pan in each axis is (z-1) * half-canvas.
function clampCamera() {
  const maxPX = canvas.width / 2 * (zoom - 1);
  const maxPY = canvas.height / 2 * (zoom - 1);
  panX = Math.max(-maxPX, Math.min(maxPX, panX));
  panY = Math.max(-maxPY, Math.min(maxPY, panY));
}

// Parallax: factor by which a plant at given depth follows camera (0.82 far → 1.0 near)
// Subtle so plant bases and earth stay close to aligned when zoomed/panned.
function depthFactor(depth) { return 0.82 + 0.18 * depth; }

function applyCameraTransform(depth) {
  const f = depthFactor(depth);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const s = 1 + (zoom - 1) * f;
  ctx.translate(panX * f, panY * f);
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
}

function screenBoundsOf(plant) {
  const f = depthFactor(plant.depth);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const s = 1 + (zoom - 1) * f;
  const b = plant.bounds;
  return {
    x: (b.x - cx) * s + cx + panX * f,
    y: (b.y - cy) * s + cy + panY * f,
    w: b.w * s,
    h: b.h * s,
  };
}

// ============== CONIFER (stacked drooping boughs + bark trunk + needle texture) ==============
function drawConifer(x, baseY, h, w, light, dark, trunkColor) {
  const trunkW = Math.max(3, w * 0.06);
  const topY = baseY - h;

  // Full-height tapered trunk with faint bark streaks
  ctx.fillStyle = trunkColor;
  ctx.beginPath();
  ctx.moveTo(x - trunkW / 2, baseY);
  ctx.lineTo(x - trunkW * 0.08, topY + 4);
  ctx.lineTo(x + trunkW * 0.08, topY + 4);
  ctx.lineTo(x + trunkW / 2, baseY);
  ctx.closePath();
  ctx.fill();
  // trunk bark streaks
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) {
    const sx = x + rand(-trunkW * 0.35, trunkW * 0.35);
    ctx.beginPath();
    ctx.moveTo(sx, baseY);
    ctx.lineTo(sx + rand(-1, 1), baseY - h * 0.4);
    ctx.stroke();
  }

  // Boughs: draw many drooping branch "sweeps" from bottom to top.
  // Each bough is a horizontal lens-shaped cluster with a dark base + lighter top highlight.
  const boughCount = Math.max(14, Math.floor(h / 22));
  const taperExp = rand(0.55, 0.7);
  for (let i = boughCount - 1; i >= 0; i--) {
    const t = (i + 0.5) / boughCount;          // 0 at top, 1 at bottom
    const by = topY + h * Math.pow(t, 1.02);
    const bw = w * Math.pow(t, taperExp) * rand(0.92, 1.08);
    if (bw < 6) continue;
    const bh = Math.max(10, bw * 0.22);
    const droop = bh * rand(0.45, 0.7);
    // tilt per bough for organic variation
    const tilt = rand(-0.04, 0.04);

    // Dark base — bottom lip of the bough (where shadow sits)
    ctx.save();
    ctx.translate(x, by);
    ctx.rotate(tilt);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, -bh * 0.3);
    ctx.quadraticCurveTo(-bw * 0.3, -bh * 0.35, -bw * 0.5, bh * 0.15);
    ctx.quadraticCurveTo(-bw * 0.35, bh * 0.9 + droop * 0.25, -bw * 0.1, bh * 0.7);
    ctx.quadraticCurveTo(0, bh * 0.9, bw * 0.1, bh * 0.7);
    ctx.quadraticCurveTo(bw * 0.35, bh * 0.9 + droop * 0.25, bw * 0.5, bh * 0.15);
    ctx.quadraticCurveTo(bw * 0.3, -bh * 0.35, 0, -bh * 0.3);
    ctx.closePath();
    ctx.fill();

    // Light top of the bough (sun on upper surface)
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.3, -bh * 0.1);
    ctx.quadraticCurveTo(-bw * 0.28, -bh * 0.4, -bw * 0.05, -bh * 0.3);
    ctx.quadraticCurveTo(bw * 0.05, -bh * 0.35, bw * 0.28, -bh * 0.4);
    ctx.quadraticCurveTo(bw * 0.3, -bh * 0.1, 0, bh * 0.05);
    ctx.quadraticCurveTo(-bw * 0.12, bh * 0.05, -bw * 0.3, -bh * 0.1);
    ctx.closePath();
    ctx.fill();

    // Fine needle fringe at the drooping tips (short strokes)
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    const tips = Math.max(3, Math.floor(bw / 14));
    for (let k = 0; k < tips; k++) {
      const tt = k / tips;
      const nx = -bw * 0.48 + bw * 0.96 * tt;
      const ny = bh * 0.18 + Math.sin(tt * Math.PI) * bh * 0.18;
      // short drooping needle
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + rand(-1.5, 1.5), ny + rand(3, 6));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Fine apex tip — a sharp dark triangle emerging from the top bough
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x - w * 0.05, topY + h * 0.07);
  ctx.lineTo(x + w * 0.05, topY + h * 0.07);
  ctx.closePath();
  ctx.fill();

  drawTreeBase(x, baseY, trunkW, trunkColor);
}

// ============== BROADLEAF (mature oak-like spreading crown with many limbs) ==============
function drawBroadleaf(x, baseY, h, w, light, mid, dark, trunkColor) {
  const trunkVisible = h * 0.35;
  const trunkW = Math.max(5, w * 0.09);

  // Tapered trunk
  ctx.fillStyle = trunkColor;
  ctx.beginPath();
  ctx.moveTo(x - trunkW / 2, baseY);
  ctx.lineTo(x - trunkW * 0.38, baseY - trunkVisible);
  ctx.lineTo(x + trunkW * 0.38, baseY - trunkVisible);
  ctx.lineTo(x + trunkW / 2, baseY);
  ctx.closePath();
  ctx.fill();
  // trunk bark shading
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + trunkW * 0.15, baseY - trunkVisible, trunkW * 0.32, trunkVisible);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x - trunkW / 2, baseY - trunkVisible, trunkW * 0.22, trunkVisible);

  // Main limbs: fan out wide & up from high on the trunk
  const forkY = baseY - trunkVisible * 0.85;
  const limbCount = 8 + randi(0, 3);
  const limbs = [];
  ctx.strokeStyle = trunkColor;
  ctx.lineCap = 'round';
  for (let i = 0; i < limbCount; i++) {
    // Spread angles evenly across upper arc with jitter
    const baseAngle = -Math.PI * (0.12 + (i / (limbCount - 1)) * 0.76);
    const angle = baseAngle + rand(-0.12, 0.12);
    // crown extends roughly equally in all upper directions
    const len = (h - trunkVisible) * rand(0.5, 0.95);
    const tipX = x + Math.cos(angle) * len;
    const tipY = forkY + Math.sin(angle) * len * 0.9;
    // main limb — curves upward with smooth taper
    ctx.lineWidth = trunkW * rand(0.35, 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rand(-3, 3), forkY);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * len * 0.45,
      forkY + Math.sin(angle) * len * 0.55,
      tipX, tipY
    );
    ctx.stroke();
    // 2-3 secondary branchlets
    ctx.lineWidth = trunkW * 0.2;
    const midX = x + Math.cos(angle) * len * 0.6;
    const midY = forkY + Math.sin(angle) * len * 0.6;
    const subN = 2 + randi(0, 1);
    for (let s = 0; s < subN; s++) {
      const subA = angle + (s - (subN - 1) / 2) * 0.5 + rand(-0.15, 0.15);
      const subLen = len * rand(0.2, 0.4);
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(midX + Math.cos(subA) * subLen, midY + Math.sin(subA) * subLen);
      ctx.stroke();
    }
    limbs.push({ x: tipX, y: tipY, r: w * rand(0.16, 0.24) });
  }

  // Sort back-to-front by y
  limbs.sort((a, b) => a.y - b.y);

  // Dark base cluster around each limb — these puffs define crown outline
  for (const L of limbs) {
    ctx.fillStyle = dark;
    const puffs = 6 + randi(0, 3);
    for (let i = 0; i < puffs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * L.r * 0.8;
      const px = L.x + Math.cos(a) * d;
      const py = L.y + Math.sin(a) * d;
      ctx.beginPath();
      ctx.arc(px, py, rand(L.r * 0.75, L.r * 1.15), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Midtone — inner shaded mass
  for (const L of limbs) {
    ctx.fillStyle = mid;
    const puffs = 5 + randi(0, 2);
    for (let i = 0; i < puffs; i++) {
      const px = L.x + rand(-L.r * 0.55, L.r * 0.4);
      const py = L.y + rand(-L.r * 0.7, L.r * 0.2);
      ctx.beginPath();
      ctx.arc(px, py, rand(L.r * 0.5, L.r * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Sun highlights — upper left of each cluster
  for (const L of limbs) {
    ctx.fillStyle = light;
    const puffs = 2 + randi(0, 2);
    for (let i = 0; i < puffs; i++) {
      const px = L.x + rand(-L.r * 0.45, L.r * 0.15);
      const py = L.y + rand(-L.r * 0.75, -L.r * 0.25);
      ctx.beginPath();
      ctx.arc(px, py, rand(L.r * 0.25, L.r * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Tiny leaf dots scattered on top of each cluster for texture
  for (const L of limbs) {
    ctx.fillStyle = light;
    for (let i = 0; i < 4; i++) {
      const px = L.x + rand(-L.r * 0.7, L.r * 0.5);
      const py = L.y + rand(-L.r, L.r * 0.3);
      ctx.beginPath();
      ctx.arc(px, py, rand(1.5, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTreeBase(x, baseY, trunkW, trunkColor);
}

// ============== DOGWOOD (wide spreading tiered tree with 4-petal flowers) ==============
function drawDogwood(x, baseY, h, w) {
  const trunkW = Math.max(4, w * 0.07);
  // Trunk curves slightly, tapering upward
  ctx.strokeStyle = '#5a3e28';
  ctx.lineWidth = trunkW;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + rand(-5, 5), baseY - h * 0.5, x + rand(-6, 6), baseY - h);
  ctx.stroke();

  const tiers = 5 + randi(0, 2);
  for (let i = 0; i < tiers; i++) {
    const t = (i + 0.6) / tiers;
    const y = baseY - h * (0.18 + t * 0.78);
    // spread grows with height — dogwood is often wider at top
    const spread = w * (0.55 + t * 0.5) * rand(0.9, 1.12);
    const tierCx = x + rand(-spread * 0.08, spread * 0.08);

    // Horizontal branches (thin, will be mostly covered)
    ctx.strokeStyle = '#5a3e26';
    ctx.lineWidth = Math.max(1, trunkW * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.lineTo(tierCx - spread * 0.5, y + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.lineTo(tierCx + spread * 0.5, y + 2);
    ctx.stroke();

    // Solid tier ellipse base — covers branches, fills gaps
    ctx.fillStyle = '#2d5830';
    ctx.beginPath();
    ctx.ellipse(tierCx, y, spread / 2 * 0.95, Math.max(10, h * 0.07), 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark blob texture over the base for irregular edges
    ctx.fillStyle = '#2d5830';
    for (let j = 0; j < 22; j++) {
      const blobX = tierCx + rand(-spread / 2, spread / 2);
      const blobY = y + rand(-10, 10);
      ctx.beginPath();
      ctx.arc(blobX, blobY, rand(7, 13), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4e8a3c';
    for (let j = 0; j < 14; j++) {
      const blobX = tierCx + rand(-spread / 2 * 0.88, spread / 2 * 0.88);
      const blobY = y + rand(-10, 3);
      ctx.beginPath();
      ctx.arc(blobX, blobY, rand(5, 9), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6db060';
    for (let j = 0; j < 8; j++) {
      const blobX = tierCx + rand(-spread / 2 * 0.72, spread / 2 * 0.72);
      const blobY = y - rand(3, 11);
      ctx.beginPath();
      ctx.arc(blobX, blobY, rand(3, 6), 0, Math.PI * 2);
      ctx.fill();
    }

    // 4-petal white/cream dogwood flowers on the top tiers — irregular sizes, random rotation, asymmetric petals
    if (i >= tiers - 3) {
      const flowerCount = 5 + randi(0, 3);
      for (let f = 0; f < flowerCount; f++) {
        const fx = tierCx + rand(-spread / 2 * 0.85, spread / 2 * 0.85);
        const fy = y - rand(-2, 10);
        const pr = rand(2.5, 5.5);
        const rot = rand(0, Math.PI * 2);
        // slightly pink-tinged cream to warm white per flower
        const tint = pick(['#f6ecd6', '#f8eede', '#fae4d4', '#f0dcc4']);
        ctx.fillStyle = tint;
        for (let p = 0; p < 4; p++) {
          const pa = rot + (p / 4) * Math.PI * 2 + rand(-0.18, 0.18);
          const petalR = pr * rand(0.8, 1.15);
          const petalOvate = rand(0.6, 0.8);
          const dist = petalR * rand(0.7, 0.95);
          ctx.beginPath();
          ctx.ellipse(
            fx + Math.cos(pa) * dist,
            fy + Math.sin(pa) * dist,
            petalR, petalR * petalOvate,
            pa, 0, Math.PI * 2
          );
          ctx.fill();
        }
        // Yellow-green center with slight jitter
        ctx.fillStyle = pick(['#d8a020', '#c89018', '#e4b030']);
        ctx.beginPath();
        ctx.arc(fx + rand(-0.5, 0.5), fy + rand(-0.5, 0.5), pr * rand(0.3, 0.42), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTreeBase(x, baseY, trunkW, '#5a3e28');
}

// ============== HOLLY (dense dark ovate bush with spiky glossy leaves + red berries) ==============
function drawHolly(x, baseY, h, w) {
  const trunkW = Math.max(3, w * 0.07);
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(x - trunkW / 2, baseY - h * 0.25, trunkW, h * 0.25 + 2);

  const crownCy = baseY - h * 0.55;
  const rx = w / 2;
  const ry = h * 0.5;

  // Dense spiky leaves — no discrete base shape, leaves alone fill the crown
  const leafCount = Math.max(60, Math.floor((rx * ry) / 22));
  const leaves = [];
  for (let i = 0; i < leafCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.98;
    const px = x + Math.cos(a) * rx * r;
    const py = crownCy + Math.sin(a) * ry * r;
    leaves.push({ px, py, rot: rand(0, Math.PI * 2), sz: rand(10, 14), depth: py });
  }
  leaves.sort((a, b) => a.depth - b.depth);

  for (const L of leaves) {
    // smooth color gradient based on vertical position
    const tt = Math.max(0, Math.min(1, (L.depth - (crownCy - ry)) / (2 * ry)));
    const jitter = (Math.random() - 0.5) * 0.12;
    const tFinal = Math.max(0, Math.min(1, tt + jitter));
    const r = Math.round(0x40 * (1 - tFinal) + 0x1e * tFinal);
    const g = Math.round(0x6e * (1 - tFinal) + 0x38 * tFinal);
    const b = Math.round(0x40 * (1 - tFinal) + 0x20 * tFinal);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.save();
    ctx.translate(L.px, L.py);
    ctx.rotate(L.rot);
    ctx.beginPath();
    ctx.moveTo(-L.sz, 0);
    ctx.lineTo(-L.sz * 0.6, -L.sz * 0.45);
    ctx.lineTo(-L.sz * 0.25, -L.sz * 0.2);
    ctx.lineTo(L.sz * 0.05, -L.sz * 0.55);
    ctx.lineTo(L.sz * 0.4, -L.sz * 0.2);
    ctx.lineTo(L.sz * 0.7, -L.sz * 0.5);
    ctx.lineTo(L.sz, 0);
    ctx.lineTo(L.sz * 0.7, L.sz * 0.5);
    ctx.lineTo(L.sz * 0.4, L.sz * 0.2);
    ctx.lineTo(L.sz * 0.05, L.sz * 0.55);
    ctx.lineTo(-L.sz * 0.25, L.sz * 0.2);
    ctx.lineTo(-L.sz * 0.6, L.sz * 0.45);
    ctx.closePath();
    ctx.fill();
    // Glossy highlight (a thin bright streak on the leaf surface)
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.ellipse(-L.sz * 0.2, -L.sz * 0.1, L.sz * 0.45, L.sz * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Red berry clusters — natural packing around a center point
  const clusters = 4 + randi(0, 3);
  for (let c = 0; c < clusters; c++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(0.3, 0.85);
    const cx2 = x + Math.cos(a) * rx * r;
    const cy2 = crownCy + Math.sin(a) * ry * r;
    const count = 5 + randi(0, 3);
    for (let i = 0; i < count; i++) {
      const ba = Math.random() * Math.PI * 2;
      const bd = Math.sqrt(Math.random()) * 4.5;
      const bx = cx2 + Math.cos(ba) * bd;
      const by = cy2 + Math.sin(ba) * bd;
      ctx.fillStyle = '#c82020';
      ctx.beginPath();
      ctx.arc(bx, by, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5048';
      ctx.beginPath();
      ctx.arc(bx - 0.9, by - 0.9, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTreeBase(x, baseY, Math.max(4, w * 0.08), '#4a3020');
}

// ============== HAZEL (dense multi-stem bushy shrub) ==============
function drawHazel(x, baseY, h, w) {
  // Multiple thin stems fanning from base
  const stems = 5 + randi(0, 3);
  for (let s = 0; s < stems; s++) {
    ctx.strokeStyle = pick(['#5c3c20', '#6e4c28', '#4e301a']);
    ctx.lineWidth = 2 + Math.random();
    ctx.lineCap = 'round';
    const startX = x + rand(-w * 0.12, w * 0.12);
    const midX = x + rand(-w * 0.35, w * 0.35);
    const tipX = x + rand(-w * 0.48, w * 0.48);
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.quadraticCurveTo(midX, baseY - h * 0.55, tipX, baseY - h * 0.88);
    ctx.stroke();
  }

  const cy = baseY - h * 0.52;
  const rx = w / 2;
  const ry = h * 0.55;

  // Dense overlapping puff mass — each puff's color depends on its position (up-left = lighter)
  const puffs = 35;
  for (let i = 0; i < puffs; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.95;
    const px = x + Math.cos(a) * rx * r;
    const py = cy + Math.sin(a) * ry * r;
    // sun comes from upper-left — lighter in that direction
    const leftFactor = -(px - x) / rx;
    const topFactor = -(py - cy) / ry;
    const lit = Math.max(0, Math.min(1, (leftFactor + topFactor) * 0.35 + 0.5));
    const lightCol = [0x7c, 0xb0, 0x5c], darkCol = [0x2c, 0x58, 0x28];
    const cR = Math.round(lightCol[0] * lit + darkCol[0] * (1 - lit));
    const cG = Math.round(lightCol[1] * lit + darkCol[1] * (1 - lit));
    const cB = Math.round(lightCol[2] * lit + darkCol[2] * (1 - lit));
    ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
    ctx.beginPath();
    ctx.arc(px, py, rand(Math.max(10, w * 0.08), Math.max(16, w * 0.14)), 0, Math.PI * 2);
    ctx.fill();
  }

  // Small individual leaves scattered on the surface
  for (let i = 0; i < 45; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.88;
    const px = x + Math.cos(a) * rx * r;
    const py = cy + Math.sin(a) * ry * r;
    ctx.fillStyle = pick(['#6aa84c', '#7ab85a', '#88c460', '#568a3e']);
    ctx.beginPath();
    ctx.ellipse(px, py, rand(3, 5.5), rand(2, 3.8), rand(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }

  drawTreeBase(x, baseY, Math.max(3, w * 0.06), '#5c3c20');
}

// ============== BRAMBLE (dense tangled thicket with thorny canes, leaves, berries) ==============
function drawBramble(x, baseY, h, w) {
  const rx = w / 2;
  const ry = h * 0.55;
  const cy = baseY - ry * 0.9;

  // Dense tangled cane mass — many crossing arching stems
  const canes = 14 + randi(0, 6);
  const canePoints = [];
  for (let c = 0; c < canes; c++) {
    const dir = chance(0.5) ? -1 : 1;
    const startX = x + rand(-w * 0.1, w * 0.1);
    const peakX = x + dir * w * rand(0.15, 0.45);
    const peakY = baseY - h * rand(0.75, 1.05);
    const tipX = x + dir * w * rand(0.3, 0.55);
    const tipY = baseY - h * rand(0.2, 0.6);
    ctx.strokeStyle = pick(['#6a4022', '#7a4a24', '#553218']);
    ctx.lineWidth = 1.3 + Math.random() * 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.quadraticCurveTo(peakX, peakY, tipX, tipY);
    ctx.stroke();
    // Sample cane positions for leaves & thorns
    const steps = 10;
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      const mt = 1 - t;
      const px = mt * mt * startX + 2 * mt * t * peakX + t * t * tipX;
      const py = mt * mt * baseY + 2 * mt * t * peakY + t * t * tipY;
      const dx = 2 * mt * (peakX - startX) + 2 * t * (tipX - peakX);
      const dy = 2 * mt * (peakY - baseY) + 2 * t * (tipY - peakY);
      const dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl, ny = dx / dl;
      canePoints.push({ px, py, nx, ny, t });
      // small thorn
      if (k % 2 === 0) {
        ctx.strokeStyle = '#3a1e0a';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx * 3, py + ny * 3);
        ctx.stroke();
      }
    }
  }

  // Palmate compound leaves (3-5 leaflets per cluster) at ~half the cane points
  for (const p of canePoints) {
    if (Math.random() > 0.55) continue;
    const leaflets = 3 + randi(0, 2);
    const centerAngle = Math.atan2(p.ny, p.nx);
    for (let l = 0; l < leaflets; l++) {
      const spread = (l - (leaflets - 1) / 2) * 0.55;
      const la = centerAngle + spread;
      const len = rand(5, 9);
      const lx = p.px + Math.cos(la) * len * 0.6;
      const ly = p.py + Math.sin(la) * len * 0.6;
      ctx.fillStyle = pick(['#3e7a30', '#4c8a3a', '#2e5a24', '#568c3c']);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(la);
      ctx.beginPath();
      // serrated leaf — rounded pointy oval
      ctx.moveTo(-len * 0.6, 0);
      ctx.quadraticCurveTo(-len * 0.3, -len * 0.3, len * 0.4, -len * 0.2);
      ctx.quadraticCurveTo(len * 0.7, 0, len * 0.4, len * 0.2);
      ctx.quadraticCurveTo(-len * 0.3, len * 0.3, -len * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Berry clusters — natural druplet packing
  const berryCount = 3 + randi(0, 3);
  for (let i = 0; i < berryCount; i++) {
    const bx = x + rand(-w * 0.35, w * 0.35);
    const by = baseY - h * rand(0.3, 0.7);
    const ripe = chance(0.5);
    const baseCol = ripe ? '#1e0a12' : '#9a2030';
    const hiCol = ripe ? '#4a2438' : '#c85060';
    const druplets = 7 + randi(0, 3);
    for (let j = 0; j < druplets; j++) {
      const ba = Math.random() * Math.PI * 2;
      const bd = Math.sqrt(Math.random()) * 3.5;
      const dx = bx + Math.cos(ba) * bd;
      const dy = by + Math.sin(ba) * bd;
      ctx.fillStyle = baseCol;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hiCol;
      ctx.beginPath();
      ctx.arc(dx - 0.6, dy - 0.6, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tiny white/pink flowers here and there
  for (let i = 0; i < 4; i++) {
    const fx = x + rand(-w * 0.3, w * 0.3);
    const fy = baseY - h * rand(0.3, 0.8);
    ctx.fillStyle = '#f4dce0';
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(pa) * 2, fy + Math.sin(pa) * 2, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d4a020';
    ctx.beginPath();
    ctx.arc(fx, fy, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============== FERN (pinnate fronds with pointed leaflet pinnae) ==============
function drawFern(x, baseY, size) {
  const fronds = 5 + randi(0, 3);
  for (let f = 0; f < fronds; f++) {
    // Fronds radiate in a rosette from the base — upward biased
    const a = Math.PI * rand(0.2, 0.8);
    const len = size * rand(0.85, 1.05);
    const tipX = x + Math.cos(a) * len;
    const tipY = baseY - Math.sin(a) * len;

    // Arched stem (rachis)
    const arch = size * 0.2;
    const midX = (x + tipX) / 2 - Math.sin(a) * arch * (Math.cos(a) >= 0 ? 1 : -1);
    const midY = (baseY + tipY) / 2 - Math.cos(Math.abs(a - Math.PI / 2)) * arch;
    const leafColor = pick(['#4a8a38', '#5aa040', '#3e7a32', '#55982c']);
    ctx.strokeStyle = '#3a5e28';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();

    // Leaflets (pinnae) — pointed oval leaf shapes along the stem
    const steps = 16;
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      const mt = 1 - t;
      const sx = mt * mt * x + 2 * mt * t * midX + t * t * tipX;
      const sy = mt * mt * baseY + 2 * mt * t * midY + t * t * tipY;
      const dx = 2 * mt * (midX - x) + 2 * t * (tipX - midX);
      const dy = 2 * mt * (midY - baseY) + 2 * t * (tipY - midY);
      const dl = Math.hypot(dx, dy) || 1;
      const tanX = dx / dl, tanY = dy / dl;
      const nx = -tanY, ny = tanX;

      const bell = Math.sin(Math.PI * Math.min(1, t * 1.1));
      const lLen = size * 0.2 * bell;
      if (lLen < 2) continue;

      ctx.fillStyle = leafColor;
      // Upper leaflet — pointed oval extending perpendicular to stem, curving up toward tip
      for (const side of [1, -1]) {
        const endX = sx + nx * lLen * side + tanX * lLen * 0.25;
        const endY = sy + ny * lLen * side + tanY * lLen * 0.25;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(
          sx + nx * lLen * 0.55 * side + tanX * lLen * 0.05,
          sy + ny * lLen * 0.55 * side + tanY * lLen * 0.05,
          endX, endY
        );
        ctx.quadraticCurveTo(
          sx + nx * lLen * 0.45 * side - tanX * lLen * 0.15,
          sy + ny * lLen * 0.45 * side - tanY * lLen * 0.15,
          sx, sy
        );
        ctx.closePath();
        ctx.fill();
      }
    }
    // tiny fiddlehead curl at tip (uncurling frond)
    if (f === 0 || Math.random() < 0.3) {
      ctx.strokeStyle = leafColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 3, 0, Math.PI * 1.5, false);
      ctx.stroke();
    }
  }
}

// ============== WILDFLOWER (scaled stem + basal leaves + flower head) ==============
function drawWildflower(x, baseY, h) {
  const type = pick(['daisy', 'fireweed', 'buttercup', 'violet']);
  const stemColor = '#3e7030';
  const flowerScale = Math.max(1, h / 20); // flower size scales with plant height

  // Stem — slight curve, thicker at base
  ctx.strokeStyle = stemColor;
  ctx.lineWidth = Math.max(1, flowerScale * 0.9);
  ctx.lineCap = 'round';
  const tipX = x + rand(-h * 0.08, h * 0.08);
  const tipY = baseY - h;
  const midX = x + rand(-h * 0.04, h * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(midX, baseY - h * 0.55, tipX, tipY);
  ctx.stroke();

  // Basal rosette leaves at bottom
  ctx.fillStyle = '#4e8a3a';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI + (i / 2) * Math.PI + rand(-0.3, 0.3);
    const lLen = h * 0.25 * rand(0.8, 1.1);
    const lx = x + Math.cos(a) * lLen * 0.5;
    const ly = baseY - Math.abs(Math.sin(a)) * lLen * 0.3;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, lLen * 0.5, flowerScale * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Stem leaves higher up
  ctx.fillStyle = '#58a044';
  for (let side = -1; side <= 1; side += 2) {
    const ly = baseY - h * rand(0.35, 0.65);
    ctx.save();
    ctx.translate(x, ly);
    ctx.rotate(side * 0.5);
    ctx.beginPath();
    ctx.ellipse(side * flowerScale * 1.5, 0, flowerScale * 2.4, flowerScale * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Flower head
  if (type === 'daisy') {
    const petalR = flowerScale * 3;
    const petals = 10;
    const rot = rand(0, Math.PI * 2);
    for (let i = 0; i < petals; i++) {
      const a = rot + (i / petals) * Math.PI * 2;
      ctx.fillStyle = '#fbf5e4';
      ctx.save();
      ctx.translate(tipX + Math.cos(a) * petalR * 0.7, tipY + Math.sin(a) * petalR * 0.7);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, petalR, petalR * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#e4a820';
    ctx.beginPath();
    ctx.arc(tipX, tipY, flowerScale * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a87010';
    ctx.beginPath();
    ctx.arc(tipX + flowerScale * 0.15, tipY + flowerScale * 0.15, flowerScale * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'fireweed') {
    // Long tapering spike of small pink-magenta 4-petal flowers
    const spikeLen = h * 0.5;
    const buds = 8;
    for (let i = 0; i < buds; i++) {
      const t = i / (buds - 1);
      const fy = tipY + t * spikeLen;
      const fx = tipX + (Math.random() - 0.5) * 2;
      const petalR = flowerScale * (1 - t * 0.7) * 0.9;
      if (petalR < 0.6) continue;
      ctx.fillStyle = '#d04890';
      for (let p = 0; p < 4; p++) {
        const pa = (p / 4) * Math.PI * 2 + rand(-0.1, 0.1);
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(pa) * petalR * 0.8, fy + Math.sin(pa) * petalR * 0.8,
          petalR, petalR * 0.5, pa, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f080c0';
      ctx.beginPath();
      ctx.arc(fx, fy, petalR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'buttercup') {
    const petalR = flowerScale * 2.4;
    const petals = 5;
    const rot = rand(0, Math.PI * 2);
    for (let i = 0; i < petals; i++) {
      const a = rot + (i / petals) * Math.PI * 2;
      ctx.fillStyle = '#f2d020';
      ctx.save();
      ctx.translate(tipX + Math.cos(a) * petalR * 0.6, tipY + Math.sin(a) * petalR * 0.6);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, petalR, petalR * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#a8700a';
    ctx.beginPath();
    ctx.arc(tipX, tipY, flowerScale * 0.75, 0, Math.PI * 2);
    ctx.fill();
  } else { // violet — 5 petals with distinctive shape
    const petalR = flowerScale * 2.2;
    const rot = rand(0, Math.PI * 2);
    const angles = [-Math.PI * 0.5, -Math.PI * 0.15, Math.PI * 0.3, -Math.PI + 0.25, -Math.PI * 0.75]; // violet-style
    for (let i = 0; i < 5; i++) {
      const a = rot + angles[i];
      ctx.fillStyle = i < 3 ? '#8858b8' : '#6a3ea0';
      ctx.save();
      ctx.translate(tipX + Math.cos(a) * petalR * 0.55, tipY + Math.sin(a) * petalR * 0.55);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, petalR, petalR * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#f8d830';
    ctx.beginPath();
    ctx.arc(tipX, tipY, flowerScale * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // white streaks on lower petals
    ctx.strokeStyle = '#f0e8f4';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + Math.cos(rot + angles[i]) * petalR * 0.7, tipY + Math.sin(rot + angles[i]) * petalR * 0.7);
      ctx.stroke();
    }
  }
}

// ============== GRASS TUFT ==============
function drawGrass(x, baseY, h) {
  const blades = 5 + randi(0, 4);
  for (let i = 0; i < blades; i++) {
    ctx.strokeStyle = pick(['#5aa040', '#4a9038', '#6cb04f', '#3e8830', '#7ab85a']);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = x + rand(-2, 2);
    ctx.moveTo(startX, baseY);
    const tipX = x + rand(-h * 0.35, h * 0.35);
    const tipY = baseY - h * rand(0.6, 1.1);
    ctx.quadraticCurveTo(startX + rand(-3, 3), baseY - h * 0.5, tipX, tipY);
    ctx.stroke();
  }
}

// ============== MOSS PATCH ==============
function drawMoss(x, baseY, w) {
  // Base mound of moss color
  const h = rand(3, 6);
  ctx.fillStyle = '#3a6a28';
  ctx.beginPath();
  ctx.ellipse(x, baseY, w / 2, h, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // Clumped texture bumps
  const bumps = 14 + randi(0, 8);
  for (let i = 0; i < bumps; i++) {
    const px = x + rand(-w / 2 * 0.95, w / 2 * 0.95);
    const py = baseY - rand(0, h * 0.9);
    ctx.fillStyle = pick(['#4e8836', '#3e7a2e', '#5a9a3a', '#387028', '#63a840']);
    ctx.beginPath();
    ctx.arc(px, py, rand(2, 4), Math.PI, Math.PI * 2);
    ctx.fill();
  }
  // bright tips
  ctx.fillStyle = '#7ec048';
  for (let i = 0; i < 6; i++) {
    const px = x + rand(-w / 2 * 0.8, w / 2 * 0.8);
    const py = baseY - rand(h * 0.3, h * 0.95);
    ctx.beginPath();
    ctx.arc(px, py, rand(1, 2), 0, Math.PI * 2);
    ctx.fill();
  }
  // Sporophyte stalks (thin pale stalks with capsules)
  ctx.strokeStyle = '#c4a866';
  ctx.lineWidth = 0.7;
  const stalks = 2 + randi(0, 3);
  for (let i = 0; i < stalks; i++) {
    const sx = x + rand(-w / 2 * 0.7, w / 2 * 0.7);
    const tipY = baseY - rand(6, 10);
    ctx.beginPath();
    ctx.moveTo(sx, baseY - 1);
    ctx.quadraticCurveTo(sx + rand(-1, 1), baseY - 4, sx + rand(-1, 1), tipY);
    ctx.stroke();
    ctx.fillStyle = '#a88850';
    ctx.beginPath();
    ctx.ellipse(sx, tipY, 0.9, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============== MUSHROOMS ==============
function drawMushroom(x, baseY) {
  const type = pick(['amanita', 'brown', 'cluster']);
  if (type === 'amanita') {
    const capR = 7;
    const stemH = 11;
    // stem (tapered)
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath();
    ctx.moveTo(x - 1.8, baseY);
    ctx.quadraticCurveTo(x - 2.2, baseY - stemH * 0.6, x - 1.4, baseY - stemH);
    ctx.lineTo(x + 1.4, baseY - stemH);
    ctx.quadraticCurveTo(x + 2.2, baseY - stemH * 0.6, x + 1.8, baseY);
    ctx.closePath();
    ctx.fill();
    // stem shadow
    ctx.fillStyle = '#d8cfae';
    ctx.beginPath();
    ctx.moveTo(x + 0.2, baseY);
    ctx.quadraticCurveTo(x + 1.4, baseY - stemH * 0.6, x + 1.0, baseY - stemH);
    ctx.lineTo(x + 1.4, baseY - stemH);
    ctx.quadraticCurveTo(x + 2.2, baseY - stemH * 0.6, x + 1.8, baseY);
    ctx.closePath();
    ctx.fill();
    // skirt/annulus
    ctx.fillStyle = '#e8dcb8';
    ctx.beginPath();
    ctx.ellipse(x, baseY - stemH * 0.35, 2.4, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // cap (dome)
    ctx.fillStyle = '#c8242a';
    ctx.beginPath();
    ctx.ellipse(x, baseY - stemH, capR, capR * 0.75, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // cap highlight
    ctx.fillStyle = '#e84040';
    ctx.beginPath();
    ctx.ellipse(x - capR * 0.3, baseY - stemH - capR * 0.2, capR * 0.5, capR * 0.3, -0.4, Math.PI, Math.PI * 2);
    ctx.fill();
    // cap edge shadow
    ctx.fillStyle = '#9a1818';
    ctx.fillRect(x - capR, baseY - stemH, capR * 2, 1.3);
    // white spots
    ctx.fillStyle = '#ffffff';
    const spots = [[-3, -2], [2, -3], [0, -5], [-1, -1], [3.5, -1]];
    for (const [ox, oy] of spots) {
      ctx.beginPath();
      ctx.arc(x + ox, baseY - stemH + oy, Math.abs(ox) < 3 ? 0.9 : 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'brown') {
    const capR = 5;
    const stemH = 7;
    ctx.fillStyle = '#d0bc94';
    ctx.beginPath();
    ctx.moveTo(x - 1.4, baseY);
    ctx.quadraticCurveTo(x - 1.8, baseY - stemH * 0.6, x - 1.1, baseY - stemH);
    ctx.lineTo(x + 1.1, baseY - stemH);
    ctx.quadraticCurveTo(x + 1.8, baseY - stemH * 0.6, x + 1.4, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a6838';
    ctx.beginPath();
    ctx.ellipse(x, baseY - stemH, capR, capR * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a88050';
    ctx.beginPath();
    ctx.ellipse(x - capR * 0.3, baseY - stemH - capR * 0.2, capR * 0.45, capR * 0.25, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3c1c';
    ctx.fillRect(x - capR, baseY - stemH, capR * 2, 1);
  } else { // small cluster of 3
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 3.5;
      const capR = 3 - Math.abs(i - 1) * 0.5;
      const stemH = 5;
      ctx.fillStyle = '#e8dcb8';
      ctx.fillRect(x + ox - 0.8, baseY - stemH, 1.6, stemH);
      ctx.fillStyle = '#b88838';
      ctx.beginPath();
      ctx.ellipse(x + ox, baseY - stemH, capR, capR * 0.7, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d4a858';
      ctx.beginPath();
      ctx.ellipse(x + ox - capR * 0.2, baseY - stemH - capR * 0.2, capR * 0.5, capR * 0.3, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ============== FALLEN LOG ==============
function drawLog(x, y, w, h = 24) {
  // End ring dimensions (draw first so bark texture on cylinder doesn't overlap it)
  const endRx = h * 0.32;
  const endRy = h / 2;
  const endCx = x + endRx * 0.15;
  const endCy = y + h / 2;

  // --- Cylinder body (rounded via path, not rect) ---
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(endCx, y);
  ctx.lineTo(x + w - endRy * 0.3, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + endRy * 0.4);
  ctx.quadraticCurveTo(x + w, y + h, x + w - endRy * 0.3, y + h);
  ctx.lineTo(endCx, y + h);
  ctx.closePath();
  ctx.clip();

  // vertical gradient: sunlit top → shadow bottom
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#8a6842');
  grad.addColorStop(0.35, '#6e4a2a');
  grad.addColorStop(1, '#3a2410');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Horizontal bark plates — long shallow ellipses of varying tone stacked along the cylinder
  const plates = Math.max(14, Math.floor(w / 10));
  for (let i = 0; i < plates; i++) {
    const px = x + rand(endRx + 2, w + endRy * 0.3);
    const py = y + rand(0, h);
    ctx.fillStyle = pick(['#7a5632', '#5e3e20', '#8a6a42', '#4a2e14', '#6a4628']);
    ctx.beginPath();
    ctx.ellipse(px, py, rand(8, 18), rand(1.5, 3), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Deep vertical cracks
  ctx.strokeStyle = '#281808';
  ctx.lineWidth = Math.max(0.8, h * 0.05);
  ctx.lineCap = 'round';
  const cracks = Math.max(5, Math.floor(w / 45));
  for (let i = 0; i < cracks; i++) {
    const cx0 = x + rand(endRx * 2, w - 5);
    ctx.beginPath();
    ctx.moveTo(cx0, y + rand(0, h * 0.15));
    ctx.lineTo(cx0 + rand(-4, 4), y + h - rand(0, h * 0.15));
    ctx.stroke();
  }

  // Bright highlight sheen along the very top edge
  const sheen = ctx.createLinearGradient(0, y, 0, y + h * 0.25);
  sheen.addColorStop(0, 'rgba(255,230,180,0.45)');
  sheen.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h * 0.3);

  // Dark underside shadow
  const shade = ctx.createLinearGradient(0, y + h * 0.7, 0, y + h);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y + h * 0.7, w, h * 0.3);

  ctx.restore();

  // --- End face ring (left) ---
  ctx.fillStyle = '#8a6a42';
  ctx.beginPath();
  ctx.ellipse(endCx, endCy, endRx, endRy, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner lighter wood
  ctx.fillStyle = '#c8a06c';
  ctx.beginPath();
  ctx.ellipse(endCx - endRx * 0.12, endCy - endRy * 0.12, endRx * 0.88, endRy * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  // Growth rings (varied spacing)
  ctx.strokeStyle = '#7a5636';
  ctx.lineWidth = 0.8;
  const ringCount = 7;
  for (let r = 1; r <= ringCount; r++) {
    const f = Math.pow(r / (ringCount + 1), 0.7);
    ctx.beginPath();
    ctx.ellipse(endCx + rand(-0.5, 0.5), endCy + rand(-0.5, 0.5), endRx * f, endRy * f, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Radial cracks on end face
  ctx.strokeStyle = '#4a301a';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) {
    const a = rand(0, Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(endCx, endCy);
    ctx.lineTo(endCx + Math.cos(a) * endRx * 0.9, endCy + Math.sin(a) * endRy * 0.9);
    ctx.stroke();
  }
  // Dark pith center
  ctx.fillStyle = '#2a1a0a';
  ctx.beginPath();
  ctx.arc(endCx, endCy, Math.min(endRx, endRy) * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // --- Moss coverage on top (dense, irregular patches) ---
  const mossPatches = Math.max(4, Math.floor(w / 40));
  for (let i = 0; i < mossPatches; i++) {
    const pcx = x + rand(endRx * 2 + 8, w - 8);
    const pcy = y + rand(1, h * 0.25);
    const pw = rand(h * 0.4, h * 0.9);
    // base dark moss shape
    ctx.fillStyle = '#3a6828';
    for (let j = 0; j < 8; j++) {
      const bx = pcx + rand(-pw * 0.4, pw * 0.4);
      const by = pcy + rand(-1, h * 0.15);
      ctx.beginPath();
      ctx.arc(bx, by, rand(h * 0.08, h * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
    // highlight bumps
    ctx.fillStyle = pick(['#5a9a3a', '#63a840', '#78bc4a']);
    for (let j = 0; j < 6; j++) {
      const bx = pcx + rand(-pw * 0.3, pw * 0.3);
      const by = pcy + rand(-2, h * 0.08);
      ctx.beginPath();
      ctx.arc(bx, by, rand(h * 0.06, h * 0.12), Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Bracket fungus on the side ---
  if (w > 160 && Math.random() < 0.7) {
    const bcx = x + rand(endRx * 3, w - 20);
    const bcy = y + h * rand(0.35, 0.65);
    const br = h * rand(0.25, 0.4);
    // shelf shape — curved fan
    ctx.fillStyle = '#b88850';
    ctx.beginPath();
    ctx.moveTo(bcx, bcy);
    ctx.quadraticCurveTo(bcx - br * 0.6, bcy - br * 0.3, bcx - br, bcy);
    ctx.quadraticCurveTo(bcx - br * 0.6, bcy + br * 0.25, bcx, bcy);
    ctx.closePath();
    ctx.fill();
    // concentric rings
    ctx.strokeStyle = '#7a5c30';
    ctx.lineWidth = 0.8;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.moveTo(bcx, bcy);
      ctx.quadraticCurveTo(bcx - br * 0.6 * r / 4, bcy - br * 0.25 * r / 4, bcx - br * r / 4, bcy);
      ctx.quadraticCurveTo(bcx - br * 0.6 * r / 4, bcy + br * 0.2 * r / 4, bcx, bcy);
      ctx.stroke();
    }
  }

  // --- Small mushrooms sprouting from the top ---
  if (w > 180 && Math.random() < 0.7) {
    const smCount = 1 + randi(0, 2);
    for (let i = 0; i < smCount; i++) {
      const smx = x + rand(endRx * 2 + 10, w - 10);
      // stem
      ctx.fillStyle = '#efe5c8';
      ctx.fillRect(smx - 1.4, y - 6, 2.8, 6);
      // red cap
      ctx.fillStyle = '#c62830';
      ctx.beginPath();
      ctx.arc(smx, y - 6, 4, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e85048';
      ctx.beginPath();
      ctx.arc(smx - 1, y - 7, 1.3, Math.PI, Math.PI * 2);
      ctx.fill();
      // white spots
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(smx - 1.4, y - 8, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(smx + 1.2, y - 7, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ============== LEAF LITTER ==============
function drawLeafLitterOne(x, y) {
  const color = pick(['#8a5a28', '#a07038', '#b88848', '#6a4020', '#7a5a30', '#9a5a24', '#5c3a18', '#c8984a']);
  ctx.fillStyle = color;
  const kind = pick(['oval', 'lobed', 'needle', 'pointy']);
  const sz = rand(4, 8);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rand(0, Math.PI * 2));
  if (kind === 'oval') {
    ctx.beginPath();
    ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,0,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-sz, 0);
    ctx.lineTo(sz, 0);
    ctx.stroke();
  } else if (kind === 'lobed') {
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.quadraticCurveTo(sz * 0.9, -sz * 0.3, sz * 0.5, sz * 0.4);
    ctx.quadraticCurveTo(sz * 0.25, sz, 0, sz);
    ctx.quadraticCurveTo(-sz * 0.25, sz, -sz * 0.5, sz * 0.4);
    ctx.quadraticCurveTo(-sz * 0.9, -sz * 0.3, 0, -sz);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'needle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, sz * 1.3, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-sz, 0);
    ctx.quadraticCurveTo(-sz * 0.3, -sz * 0.5, sz * 0.6, -sz * 0.2);
    ctx.quadraticCurveTo(sz * 1.1, 0, sz * 0.6, sz * 0.2);
    ctx.quadraticCurveTo(-sz * 0.3, sz * 0.5, -sz, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawLeafLitter(W, earthY, earthH) {
  const count = Math.floor(W / 6);
  for (let i = 0; i < count; i++) {
    const x = rand(0, W);
    const y = earthY + rand(0, earthH * 0.75);
    drawLeafLitterOne(x, y);
  }
}

// ============== POND (single water body, irregular shape) ==============
// Builds a jittered closed curve around an ellipse so the shoreline looks natural, not a disc.
function pondOutline(cx, cy, rx, ry, inflate = 0) {
  const steps = 16;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const jitter = 0.78 + Math.random() * 0.28; // 0.78..1.06 of radius
    pts.push({
      x: cx + Math.cos(a) * (rx + inflate) * jitter,
      y: cy + Math.sin(a) * (ry + inflate) * jitter,
    });
  }
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % steps];
    const mx = (p.x + n.x) / 2, my = (p.y + n.y) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p.x, p.y, mx, my);
  }
  // close back to the first midpoint
  const p0 = pts[0], p1 = pts[1];
  ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
  ctx.closePath();
}

function drawPond(x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w / 2, ry = h / 2;

  // Muddy shoreline — slightly wider and also jittered
  ctx.fillStyle = '#3a2814';
  pondOutline(cx, cy, rx, ry, 9);
  ctx.fill();
  ctx.fillStyle = '#4e3c22';
  pondOutline(cx, cy, rx, ry, 5);
  ctx.fill();

  // Water body
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#3e6a78');
  grad.addColorStop(0.45, '#265a70');
  grad.addColorStop(1, '#12304e');
  ctx.fillStyle = grad;
  pondOutline(cx, cy, rx, ry, 0);
  ctx.fill();

  // Clip further highlights to the water shape so nothing leaks onto the shore.
  ctx.save();
  pondOutline(cx, cy, rx, ry, 0);
  ctx.clip();

  // Sky reflection on upper portion
  const refl = ctx.createLinearGradient(0, y, 0, y + h * 0.65);
  refl.addColorStop(0, 'rgba(170,205,220,0.45)');
  refl.addColorStop(1, 'rgba(170,205,220,0)');
  ctx.fillStyle = refl;
  ctx.fillRect(x - 10, y - 2, w + 20, h);

  // Ripples — bright horizontal streaks
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  const ripples = 6 + Math.floor(w / 60);
  for (let i = 0; i < ripples; i++) {
    const rt = rand(0.15, 0.85);
    const ry1 = y + h * rt;
    const maxHalfW = Math.sqrt(Math.max(0, 1 - Math.pow((rt - 0.5) * 2, 2))) * rx;
    const stretch = rand(0.25, 0.85);
    const rxc = cx + rand(-maxHalfW * (1 - stretch), maxHalfW * (1 - stretch));
    const rhalf = maxHalfW * stretch;
    ctx.beginPath();
    ctx.moveTo(rxc - rhalf, ry1);
    ctx.lineTo(rxc + rhalf, ry1);
    ctx.stroke();
  }

  // Dark ripples for variation
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 3; i++) {
    const rt = rand(0.55, 0.9);
    const ry1 = y + h * rt;
    const maxHalfW = Math.sqrt(Math.max(0, 1 - Math.pow((rt - 0.5) * 2, 2))) * rx;
    const rhalf = maxHalfW * rand(0.3, 0.6);
    const rxc = cx + rand(-maxHalfW * 0.2, maxHalfW * 0.2);
    ctx.beginPath();
    ctx.moveTo(rxc - rhalf, ry1);
    ctx.lineTo(rxc + rhalf, ry1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEarth(W, earthY, earthH) {
  // Extend far beyond the visible canvas so panning/zooming never reveals gaps.
  const padX = W * 2, padY = earthH * 10;
  ctx.fillStyle = '#2e4a20';
  ctx.fillRect(-padX, earthY, W + padX * 2, padY);
  const groundGrad = ctx.createLinearGradient(0, earthY, 0, earthY + earthH);
  groundGrad.addColorStop(0, 'rgba(30,50,20,0)');
  groundGrad.addColorStop(1, 'rgba(12,24,8,0.75)');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-padX, earthY, W + padX * 2, padY);
}

// Render a single plant type centered for --plant showcase mode
function drawSinglePlant(name, cx, earthY, H, W) {
  switch (name) {
    case 'conifer':
      drawConifer(cx, earthY, H * 0.75, H * 0.22, '#3a6840', '#28482c', '#3a1e10');
      break;
    case 'broadleaf':
      drawBroadleaf(cx, earthY, H * 0.7, H * 0.4, '#5a9850', '#3f7844', '#2e5633', '#3a2818');
      break;
    case 'dogwood':
      drawDogwood(cx, earthY, H * 0.45, H * 0.6);
      break;
    case 'holly':
      drawHolly(cx, earthY, H * 0.35, H * 0.2);
      break;
    case 'hazel':
      drawHazel(cx, earthY, H * 0.4, H * 0.5);
      break;
    case 'bramble':
      drawBramble(cx, earthY, H * 0.3, H * 0.4);
      break;
    case 'fern':
      drawFern(cx, earthY, H * 0.5);
      break;
    case 'wildflower':
      // Show all four types side by side, larger
      for (let i = 0; i < 4; i++) {
        drawWildflower(cx - W * 0.3 + i * W * 0.2, earthY, H * 0.25);
      }
      break;
    case 'grass':
      drawGrass(cx, earthY, H * 0.25);
      break;
    case 'moss':
      ctx.save();
      ctx.translate(cx, earthY);
      ctx.scale(5, 5);
      drawMoss(0, 0, H * 0.08);
      ctx.restore();
      break;
    case 'mushroom':
      ctx.save();
      ctx.translate(cx, earthY);
      ctx.scale(6, 6);
      drawMushroom(-20, 0);
      drawMushroom(0, 0);
      drawMushroom(20, 0);
      ctx.restore();
      break;
    case 'log':
      drawLog(cx - H * 0.25, earthY + 20, H * 0.5);
      break;
    case 'litter':
      drawLeafLitter(W, earthY, H * 0.1);
      break;
    default:
      console.error(`Unknown plant: ${name}`);
  }
}

// Root flare + ground detail so trees look naturally rooted.
// Keep this SUBTLE — heavy shadows/flares read as a "plate around the trunk".
function drawTreeBase(x, baseY, trunkW, trunkColor) {
  // Small root flare: the trunk gently widens as it meets the ground.
  // No fill polygon — just slightly thicker curve matching the trunk. This avoids a visible "disc".
  ctx.fillStyle = trunkColor;
  ctx.beginPath();
  ctx.moveTo(x - trunkW * 0.95, baseY + 1);
  ctx.quadraticCurveTo(x - trunkW * 0.7, baseY - trunkW * 0.08, x - trunkW * 0.5, baseY - trunkW * 0.25);
  ctx.lineTo(x + trunkW * 0.5, baseY - trunkW * 0.25);
  ctx.quadraticCurveTo(x + trunkW * 0.7, baseY - trunkW * 0.08, x + trunkW * 0.95, baseY + 1);
  ctx.closePath();
  ctx.fill();

  // Two short tapered surface roots — thin, not wider than the flare
  ctx.strokeStyle = trunkColor;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const reach = trunkW * rand(0.9, 1.4);
    const tipX = x + side * reach;
    const tipY = baseY + rand(1, 3);
    ctx.lineWidth = Math.max(1.2, trunkW * 0.3);
    ctx.beginPath();
    ctx.moveTo(x + side * trunkW * 0.4, baseY - trunkW * 0.05);
    ctx.quadraticCurveTo(x + side * trunkW * 0.8, baseY - trunkW * 0.02, tipX, tipY);
    ctx.stroke();
  }

  // Grass blades right up against the trunk (both sides) — short, natural
  const tufts = 5 + randi(0, 3);
  for (let i = 0; i < tufts; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const gx = x + side * trunkW * rand(0.3, 2.0);
    ctx.strokeStyle = pick(['#4a8a38', '#58a044', '#6cb04c', '#3e7a32']);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, baseY + 1);
    ctx.quadraticCurveTo(gx + rand(-1, 1), baseY - rand(2, 4), gx + rand(-2, 2), baseY - rand(3, 7));
    ctx.stroke();
  }

  // One moss clump against the trunk (asymmetric — only on one side)
  if (chance(0.8)) {
    const mossSide = chance(0.5) ? -1 : 1;
    ctx.fillStyle = pick(['#4e8836', '#3a7028', '#5a9a3a']);
    ctx.beginPath();
    ctx.ellipse(x + mossSide * trunkW * rand(0.5, 1.2), baseY, trunkW * rand(0.4, 0.7), 2, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
}

function drawHighlight(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.max(b.w, b.h) * 0.9;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// ============== SCENE ==============
export function draw() {
  ctx = mainCtx;
  const W = canvas.width;
  const H = canvas.height;
  const skyH = H * 0.1;
  const earthY = H * 0.8;
  const earthH = H * 0.2;

  seedRNG(INITIAL_SEED);

  // Continuous sky→forest gradient — paints full canvas (below earthY it just holds the final deep forest color).
  const bgGrad = ctx.createLinearGradient(0, 0, 0, earthY);
  bgGrad.addColorStop(0.00, '#5a94c4');
  bgGrad.addColorStop(0.08, '#78abc6');
  bgGrad.addColorStop(0.15, '#7ea89a');
  bgGrad.addColorStop(0.25, '#5c7a5a');
  bgGrad.addColorStop(0.55, '#3a5438');
  bgGrad.addColorStop(1.00, '#1a2a16');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  if (ONLY_PLANT) {
    drawEarth(W, earthY, earthH);
    drawSinglePlant(ONLY_PLANT, W / 2, earthY, H, W);
    return;
  }

  // Reuse cached plant layout if canvas size unchanged — placement uses lots of rand() calls
  // and dominates each frame; rebuilding it per pan/zoom key-press is why the UI stuttered.
  const EARTH_DEPTH = 0.88;
  let plants;
  if (cachedLayout && cachedLayout.W === W && cachedLayout.H === H) {
    plants = cachedLayout.plants;
  } else {
    plants = [];
    let counter = 0;
    const place = (kind, depth, bounds, renderFn, layer = 'other') => {
      plants.push({ kind, depth, bounds, layer, seed: (INITIAL_SEED * 7919 + (counter++) * 131) | 0, renderFn });
    };

    // Ground plane: closer plants sit LOWER on screen (larger y).
    function groundY(depth) {
      return earthY + Math.max(0, depth - 0.1) * earthH * 0.5;
    }
  // Depth derived strictly from baseY — higher on screen renders behind. Used for ALL non-distant plants so
  // y-sort is consistent (mushrooms near horizon render behind ferns nearer the camera, etc.).
  function depthFromY(baseY) {
    return Math.max(0.12, Math.min(0.98, 0.2 + (baseY - earthY) / earthH * 0.75));
  }

  // Single pond somewhere on the ground — nothing grows on it.
  const pondW = rand(W * 0.14, W * 0.22);
  const pondH = rand(earthH * 0.35, earthH * 0.55);
  const pondX = rand(W * 0.15, W * 0.85 - pondW);
  const pondY = earthY + earthH * rand(0.3, 0.5);
  const pondBounds = { x: pondX, y: pondY, w: pondW, h: pondH };
  // The drawn pond is jittered up to ~1.06 × radius and also has a mud shoreline rim,
  // so we inflate the exclusion box enough to cover both.
  const PON_MARGIN_X = Math.max(18, pondW * 0.12);
  const PON_MARGIN_Y = Math.max(12, pondH * 0.18);
  function onPond(px, py) {
    return px >= pondX - PON_MARGIN_X && px <= pondX + pondW + PON_MARGIN_X
        && py >= pondY - PON_MARGIN_Y && py <= pondY + pondH + PON_MARGIN_Y;
  }
  function rectOnPond(rx, ry, rw, rh) {
    return !(rx + rw < pondX - PON_MARGIN_X
          || rx > pondX + pondW + PON_MARGIN_X
          || ry + rh < pondY - PON_MARGIN_Y
          || ry > pondY + pondH + PON_MARGIN_Y);
  }
  place('pond', depthFromY(pondY + pondH / 2), pondBounds,
    () => drawPond(pondX, pondY, pondW, pondH), 'pond');

  // Depth legend: 0.05 far / 0.20 emergent / 0.40 canopy / 0.55 understory / 0.70 shrub / 0.82 herb / 0.92 floor

  // Distant silhouettes
  for (let x = -50; x < W + 50; x += rand(120, 220)) {
    const cx = x, th = rand(H * 0.38, H * 0.58);
    const depth = 0.05 + rand(0, 0.04);
    if (chance(0.5)) {
      const cw = rand(90, 150);
      place('conifer', depth, { x: cx - cw / 2, y: earthY - th, w: cw, h: th },
        () => drawConifer(cx, earthY, th, cw, '#7a9a80', '#647864', '#4a5a4e'));
    } else {
      const cw = rand(140, 220);
      place('broadleaf', depth, { x: cx - cw / 2, y: earthY - th, w: cw, h: th },
        () => drawBroadleaf(cx, earthY, th, cw, '#88a690', '#708e76', '#55725c', '#4a4a46'));
    }
  }

  // Emergent
  const maxTallH = (earthY - skyH) * 0.98;
  const emergentCount = 2 + randi(0, 2);
  for (let i = 0; i < emergentCount; i++) {
    const cx = W * ((i + 0.5) / emergentCount) + rand(-150, 150);
    const th = rand(maxTallH * 0.92, maxTallH * 0.99);
    const by = groundY(0.18) + rand(-3, 3);
    const d = depthFromY(by);
    if (chance(0.5)) {
      const cw = rand(170, 230);
      place('conifer', d, { x: cx - cw / 2, y: by - th, w: cw, h: th },
        () => drawConifer(cx, by, th, cw, '#2e5838', '#1c3c20', '#2a1e10'), 'emergent');
    } else {
      const cw = rand(300, 400);
      place('broadleaf', d, { x: cx - cw / 2, y: by - th, w: cw, h: th },
        () => drawBroadleaf(cx, by, th, cw, '#4a7a42', '#356a38', '#24502c', '#2e1e10'), 'emergent');
    }
  }

  // Canopy
  for (let x = -60; x < W + 60; x += rand(180, 280)) {
    const cx = x, th = rand(H * 0.5, H * 0.66);
    const by = groundY(0.38) + rand(-4, 4);
    const d = depthFromY(by);
    if (chance(0.5)) {
      const cw = rand(130, 190);
      place('conifer', d, { x: cx - cw / 2, y: by - th, w: cw, h: th },
        () => drawConifer(cx, by, th, cw, '#3a6840', '#28482c', '#3a1e10'), 'canopy');
    } else {
      const cw = rand(220, 320);
      place('broadleaf', d, { x: cx - cw / 2, y: by - th, w: cw, h: th },
        () => drawBroadleaf(cx, by, th, cw, '#5a9850', '#3f7844', '#2e5633', '#3a2818'), 'canopy');
    }
  }

  // Understory
  for (let x = -20; x < W + 20; x += rand(90, 160)) {
    const cx = x, th = rand(H * 0.22, H * 0.38);
    const by = groundY(0.54) + rand(-5, 5);
    const d = depthFromY(by);
    if (chance(0.5)) {
      const cw = rand(80, 140);
      place('dogwood', d, { x: cx - cw / 2, y: by - th, w: cw, h: th },
        () => drawDogwood(cx, by, th, cw), 'understory');
    } else {
      const cw = rand(60, 100);
      place('holly', d, { x: cx - cw / 2, y: by - th, w: cw, h: th },
        () => drawHolly(cx, by, th, cw), 'understory');
    }
  }

  // Shrubs
  for (let x = -20; x < W + 20; x += rand(70, 130)) {
    const cx = x, sh = rand(H * 0.09, H * 0.16);
    const by = groundY(0.68) + rand(-6, 6);
    const d = depthFromY(by);
    if (chance(0.5)) {
      const cw = rand(55, 95);
      place('hazel', d, { x: cx - cw / 2, y: by - sh, w: cw, h: sh },
        () => drawHazel(cx, by, sh, cw), 'shrub');
    } else {
      const cw = rand(55, 95);
      place('bramble', d, { x: cx - cw / 2, y: by - sh, w: cw, h: sh },
        () => drawBramble(cx, by, sh, cw), 'shrub');
    }
  }

  // Herb layer
  for (let x = -10; x < W + 10; x += rand(18, 40)) {
    const cx = x;
    const r = Math.random();
    const by = groundY(0.80) + rand(-8, 8);
    if (onPond(cx, by)) continue;
    const d = depthFromY(by);
    if (r < 0.45) {
      const sz = rand(35, 75);
      place('fern', d, { x: cx - sz, y: by - sz, w: sz * 2, h: sz },
        () => drawFern(cx, by, sz));
    } else if (r < 0.75) {
      const fh = rand(10, 24);
      place('wildflower', d, { x: cx - 8, y: by - fh - 4, w: 16, h: fh + 6 },
        () => drawWildflower(cx, by, fh));
    } else {
      const gh = rand(12, 24);
      place('grass', d, { x: cx - 8, y: by - gh, w: 16, h: gh },
        () => drawGrass(cx, by, gh));
    }
  }

    // Floor items — every instance gets depth from its own baseY so y-sort is consistent with ferns/shrubs.
    // Leaf litter spans the entire earth strip; skip the pond area so it looks clean.
    place('litter', depthFromY(earthY + 2), { x: 0, y: earthY, w: W, h: earthH },
      () => {
        // Stamp litter in tiles so we can skip any tile that falls on the pond.
        const count = Math.floor(W / 6);
        for (let i = 0; i < count; i++) {
          const px = rand(0, W);
          const py = earthY + rand(0, earthH * 0.75);
          if (onPond(px, py)) continue;
          drawLeafLitterOne(px, py);
        }
      });
    for (let x = 0; x < W; x += rand(80, 200)) {
      const mx = x, my = earthY + rand(0, earthH * 0.85), mw = rand(35, 75);
      if (onPond(mx, my)) continue;
      place('moss', depthFromY(my), { x: mx - mw / 2, y: my - 8, w: mw, h: 14 },
        () => drawMoss(mx, my, mw));
    }
    const mushroomCount = Math.floor(W / 70);
    for (let i = 0; i < mushroomCount; i++) {
      const mx = rand(0, W), my = earthY + rand(0, earthH * 0.85);
      if (onPond(mx, my)) continue;
      place('mushroom', depthFromY(my), { x: mx - 8, y: my - 14, w: 16, h: 18 },
        () => drawMushroom(mx, my));
    }
    const logCount = 1 + randi(0, 2);
    for (let i = 0; i < logCount; i++) {
      const lw = rand(220, 380);
      const lh = rand(28, 42);
      // Pick a spot; retry a few times if it overlaps the pond. Skip if we can't find a clean spot.
      let placed = false;
      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        const lx = rand(50, W - lw - 40);
        const ly = earthY + earthH * rand(0.2, 0.75);
        if (rectOnPond(lx, ly, lw, lh)) continue;
        place('log', depthFromY(ly + lh / 2), { x: lx, y: ly, w: lw, h: lh },
          () => drawLog(lx, ly, lw, lh), 'log');
        placed = true;
      }
    }

    // Sort by depth (ascending — far first, near last)
    plants.sort((a, b) => a.depth - b.depth);
    cachedLayout = { W, H, plants };
  }
  // Distant (grayish silhouette) trees render BEHIND the ground; everything else in front.
  const DISTANT_CUTOFF = 0.1;

  // Focus: activates once zoom passes Z2; always tracks whatever is under the cursor.
  const FOCUS_LAYERS = new Set(['emergent', 'canopy', 'understory', 'shrub', 'log']);
  const Z2 = 2;
  let focusPlant = null;

  function plantAtPoint(px, py) {
    for (let i = plants.length - 1; i >= 0; i--) {
      const p = plants[i];
      if (!FOCUS_LAYERS.has(p.layer)) continue;
      const b = screenBoundsOf(p);
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return p;
    }
    return null;
  }
  function plantAtCursor() {
    // Focus tracks whatever is under the cursor. Fall back to viewport center if the mouse
    // hasn't moved over the canvas yet.
    const px = lastMouse ? lastMouse.x : W / 2;
    const py = lastMouse ? lastMouse.y : H / 2;
    return plantAtPoint(px, py);
  }

  // Focus activates once the user zooms in past Z2. Always dynamic — no lock.
  if (zoom >= Z2) focusPlant = plantAtCursor();

  // Smooth focus transitions: when a plant loses focus, it fades out over OUTGOING_MS.
  const now = nowMs();
  const intendedSeed = focusPlant ? focusPlant.seed : null;
  if (intendedSeed !== focusState.currentSeed) {
    if (focusState.currentSeed !== null) {
      focusState.outgoingSeed = focusState.currentSeed;
      focusState.outgoingStart = now;
    }
    focusState.currentSeed = intendedSeed;
  }
  const outgoingT = focusState.outgoingStart
    ? Math.min(1, (now - focusState.outgoingStart) / OUTGOING_MS)
    : 1;
  const outgoingPlant = (outgoingT < 1 && focusState.outgoingSeed !== null && focusState.outgoingSeed !== intendedSeed)
    ? plants.find(p => p.seed === focusState.outgoingSeed)
    : null;

  // Fade + blur scale with how far into the focus zones we are.
  const fadeAlpha = focusPlant ? Math.max(0.08, 1 - (zoom - Z2) * 0.32) : 1;
  const blurPx = focusPlant ? Math.min(14, (zoom - Z2) * 2.0) : 0;
  const isFocus = p => focusPlant && p === focusPlant;

  // Focus render plan — natural draw order is PRESERVED. Focus only changes visual treatment:
  // elements drawn before focus → blur only (background).
  // elements drawn after focus → blur + transparent (foreground obstructions).
  // focus itself → sharp, at its natural slot.
  const useOffscreen = !!(focusPlant && ensureOffscreen(W, H));

  // Natural draw order is: distant silhouettes → earth → foreground plants (by depth).
  // Focus, if present, is a foreground plant at index focusIdx in the foreground sequence.
  const foreground = plants.filter(p => p.depth >= DISTANT_CUTOFF);
  const focusIdx = focusPlant ? foreground.indexOf(focusPlant) : -1;

  if (!useOffscreen) {
    // No focus (or snapshot fallback): straightforward render pass
    ctx = mainCtx;
    for (const p of plants) {
      if (p.depth >= DISTANT_CUTOFF) break;
      if (p.kind === hoveredKind) continue;
      ctx.save(); applyCameraTransform(p.depth); seedRNG(p.seed); p.renderFn(); ctx.restore();
    }
    ctx.save(); applyCameraTransform(EARTH_DEPTH); drawEarth(W, earthY, earthH); ctx.restore();
    for (const p of foreground) {
      if (p.kind === hoveredKind) continue;
      ctx.save();
      applyCameraTransform(p.depth); seedRNG(p.seed);
      ctx.globalAlpha = focusPlant ? (p === focusPlant ? 1 : fadeAlpha) : 1;
      p.renderFn();
      ctx.restore();
    }
  } else {
    // PASS 1 (behind): distant silhouettes + earth + foreground plants drawn BEFORE focus (same order).
    offCtx.clearRect(0, 0, W, H);
    ctx = offCtx;
    for (const p of plants) {
      if (p.depth >= DISTANT_CUTOFF) break;
      if (p.kind === hoveredKind) continue;
      ctx.save(); applyCameraTransform(p.depth); seedRNG(p.seed); p.renderFn(); ctx.restore();
    }
    ctx.save(); applyCameraTransform(EARTH_DEPTH); drawEarth(W, earthY, earthH); ctx.restore();
    for (let i = 0; i < focusIdx; i++) {
      const p = foreground[i];
      if (p.kind === hoveredKind) continue;
      ctx.save(); applyCameraTransform(p.depth); seedRNG(p.seed); p.renderFn(); ctx.restore();
    }
    ctx = mainCtx;
    // Blit behind buffer with blur ONLY (no transparency)
    ctx.save();
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(offCanvas, 0, 0);
    ctx.restore();

    // Focus plant sharp, rendered in its natural slot
    ctx.save();
    applyCameraTransform(focusPlant.depth);
    seedRNG(focusPlant.seed);
    focusPlant.renderFn();
    ctx.restore();

    // PASS 2 (in front): foreground plants drawn AFTER focus (same order).
    offCtx.clearRect(0, 0, W, H);
    ctx = offCtx;
    for (let i = focusIdx + 1; i < foreground.length; i++) {
      const p = foreground[i];
      if (p.kind === hoveredKind) continue;
      ctx.save(); applyCameraTransform(p.depth); seedRNG(p.seed); p.renderFn(); ctx.restore();
    }
    ctx = mainCtx;
    // Blit front buffer with blur AND transparency
    ctx.save();
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = fadeAlpha;
    ctx.drawImage(offCanvas, 0, 0);
    ctx.restore();
  }

  // Smoothly fade out the previous focus plant at its natural depth position.
  if (outgoingPlant) {
    ctx = mainCtx;
    ctx.save();
    applyCameraTransform(outgoingPlant.depth);
    seedRNG(outgoingPlant.seed);
    ctx.globalAlpha = 1 - outgoingT;
    outgoingPlant.renderFn();
    ctx.restore();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => draw());
    }
  }

  // Highlight pass: only when enabled and something is hovered
  if (highlightEnabled && hoveredKind) {
    for (const p of plants) {
      if (p.kind !== hoveredKind) continue;
      ctx.save();
      applyCameraTransform(p.depth);
      drawHighlight(p.bounds);
      ctx.restore();
    }
    for (const p of plants) {
      if (p.kind !== hoveredKind) continue;
      ctx.save();
      applyCameraTransform(p.depth);
      seedRNG(p.seed);
      p.renderFn();
      ctx.restore();
    }
  }

  lastPlants = plants;

  // HUD text when highlight mode is enabled
  if (highlightEnabled) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('highlight', 16, 16);
  }
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

let isDragging = false;
let dragOrigin = null;
let lastMouse = null; // latest cursor position in canvas coords (for focus targeting)

function mouseCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function handleMouseDown(e) {
  isDragging = true;
  dragOrigin = { px: panX, py: panY, cx: e.clientX, cy: e.clientY };
  canvas.style.cursor = 'grabbing';
}

function handleMouseUp() {
  isDragging = false;
  canvas.style.cursor = '';
}

function handleMouseMove(e) {
  lastMouse = mouseCoords(e);
  if (isDragging) {
    panX = dragOrigin.px + (e.clientX - dragOrigin.cx);
    panY = dragOrigin.py + (e.clientY - dragOrigin.cy);
    clampCamera();
    scheduleDraw();
    return;
  }

  // In focus zones, cursor movement re-targets the focus, so redraw on every move.
  if (zoom > 2) {
    scheduleDraw();
    return;
  }

  if (!highlightEnabled) return;
  const { x: mx, y: my } = lastMouse;
  let found = null;
  // iterate in reverse — later-drawn plants are on top, so they take hover priority
  for (let i = lastPlants.length - 1; i >= 0; i--) {
    const p = lastPlants[i];
    if (p.kind === '_earth') continue;
    const b = screenBoundsOf(p);
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      found = p.kind;
      break;
    }
  }
  if (found !== hoveredKind) {
    hoveredKind = found;
    scheduleDraw();
  }
}

function handleWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.04 : 1 / 1.04;
  const oldZoom = zoom;
  const newZoom = Math.max(1, Math.min(60, zoom * factor));
  if (newZoom === oldZoom) return;
  const { x: mx, y: my } = mouseCoords(e);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const ratio = newZoom / oldZoom;
  // Keep point under the mouse stable (computed for the foreground layer, f=1).
  panX = (mx - cx) * (1 - ratio) + panX * ratio;
  panY = (my - cy) * (1 - ratio) + panY * ratio;
  zoom = newZoom;
  clampCamera();
  scheduleDraw();
}

// Track pressed keys so we can animate continuously (bypasses the OS key-repeat delay).
const heldKeys = new Set();
let panLoopId = null;
let panLastT = 0;
const PAN_PX_PER_SEC = 600;
const ZOOM_PER_SEC = 0.5; // log2 units per second — e^(ln2 * t * speed)

function panLoopTick(t) {
  if (!panLastT) panLastT = t;
  const dt = Math.max(0.001, Math.min(0.1, (t - panLastT) / 1000));
  panLastT = t;

  let dx = 0, dy = 0, zf = 1;
  if (heldKeys.has('ArrowLeft') || heldKeys.has('KeyA')) dx += PAN_PX_PER_SEC * dt;
  if (heldKeys.has('ArrowRight') || heldKeys.has('KeyD')) dx -= PAN_PX_PER_SEC * dt;
  if (heldKeys.has('ArrowUp') || heldKeys.has('KeyW')) dy += PAN_PX_PER_SEC * dt;
  if (heldKeys.has('ArrowDown') || heldKeys.has('KeyS')) dy -= PAN_PX_PER_SEC * dt;
  if (heldKeys.has('Equal') || heldKeys.has('NumpadAdd')) zf *= Math.pow(2, ZOOM_PER_SEC * dt);
  if (heldKeys.has('Minus') || heldKeys.has('NumpadSubtract')) zf *= Math.pow(2, -ZOOM_PER_SEC * dt);

  if (dx || dy) { panX += dx; panY += dy; }
  if (zf !== 1) {
    const oldZoom = zoom;
    zoom = Math.max(1, Math.min(60, zoom * zf));
    if (zoom !== oldZoom) {
      const ratio = zoom / oldZoom;
      // zoom about cursor if known, else canvas center
      const cx = lastMouse ? lastMouse.x : canvas.width / 2;
      const cy = lastMouse ? lastMouse.y : canvas.height / 2;
      const ccx = canvas.width / 2, ccy = canvas.height / 2;
      panX = (cx - ccx) * (1 - ratio) + panX * ratio;
      panY = (cy - ccy) * (1 - ratio) + panY * ratio;
    }
  }
  clampCamera();
  draw();

  if (heldKeys.size > 0) {
    panLoopId = requestAnimationFrame(panLoopTick);
  } else {
    panLoopId = null;
    panLastT = 0;
  }
}

const PAN_ZOOM_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyA', 'KeyD', 'KeyW', 'KeyS',
  'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract',
]);

function handleKeyDown(e) {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    highlightEnabled = !highlightEnabled;
    if (!highlightEnabled) hoveredKind = null;
    scheduleDraw();
    return;
  }

  const k = e.code;
  if (PAN_ZOOM_KEYS.has(k)) {
    e.preventDefault();
    // Browsers fire repeated keydown events after the OS-level delay; we ignore those and
    // drive motion from the animation-frame loop using the held-keys set for smooth motion.
    if (e.repeat) return;
    heldKeys.add(k);
    if (panLoopId === null && typeof requestAnimationFrame === 'function') {
      panLoopId = requestAnimationFrame(panLoopTick);
    }
  }
}

function handleKeyUp(e) {
  heldKeys.delete(e.code);
}
function handleBlur() {
  heldKeys.clear();
}

window.addEventListener('resize', resize);
if (canvas.addEventListener) {
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
}
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('blur', handleBlur);
resize();
