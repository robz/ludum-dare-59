// Naval rank labels and stylized insignia drawn on the canvas.

export const RANKS = [
  'Seaman',
  'Petty Officer',
  'Chief Petty Officer',
  'Warrant Officer',
  'Ensign',
  'Lieutenant',
  'Lieutenant Commander',
  'Commander',
  'Captain',
  'Admiral',
];

export function rankFor(level) {
  const idx = Math.max(1, Math.min(RANKS.length, level | 0)) - 1;
  return RANKS[idx];
}

export function maxRank() { return RANKS.length; }

// Draws the insignia for `level` centered at (cx, cy) inside a box of
// `size` px. Colors from the radar green/amber palette.
export function drawInsignia(ctx, cx, cy, size, level) {
  const s = size;
  ctx.save();
  switch (level) {
    case 1: drawChevrons(ctx, cx, cy, s, 1); break;
    case 2: drawChevrons(ctx, cx, cy, s, 2); break;
    case 3: drawChevronsAnchor(ctx, cx, cy, s, 3); break;
    case 4: drawHBar(ctx, cx, cy, s); break;
    case 5: drawVBars(ctx, cx, cy, s, 1, '#ffd070'); break;
    case 6: drawVBars(ctx, cx, cy, s, 2, '#ffd070'); break;
    case 7: drawOakLeaf(ctx, cx, cy, s, '#b0d68e'); break;
    case 8: drawOakLeaf(ctx, cx, cy, s, '#ffd070'); break;
    case 9: drawEagle(ctx, cx, cy, s); break;
    case 10: drawStars(ctx, cx, cy, s, 5); break;
  }
  ctx.restore();
}

function drawChevrons(ctx, cx, cy, s, n) {
  const half = s * 0.42;
  const step = s * 0.18;
  ctx.strokeStyle = '#ffd070';
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const y = cy + (i - (n - 1) / 2) * step * 1.15 + step * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx, y - half * 0.55);
    ctx.lineTo(cx + half, y);
    ctx.stroke();
  }
}

function drawChevronsAnchor(ctx, cx, cy, s, n) {
  drawChevrons(ctx, cx, cy + s * 0.1, s * 0.85, n);
  // Anchor above
  const ay = cy - s * 0.32;
  ctx.strokeStyle = '#eaffe1';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, ay - s * 0.14);
  ctx.lineTo(cx, ay + s * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, ay + s * 0.2, s * 0.12, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, ay - s * 0.08);
  ctx.lineTo(cx + s * 0.14, ay - s * 0.08);
  ctx.stroke();
}

function drawHBar(ctx, cx, cy, s) {
  const w = s * 0.7;
  const h = s * 0.22;
  ctx.fillStyle = '#c0c8cc';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = '#eaffe1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(10,28,15,0.4)';
  ctx.fillRect(cx - w / 2 + 2, cy - 1, w - 4, 2);
}

function drawVBars(ctx, cx, cy, s, n, color) {
  const w = s * 0.16;
  const h = s * 0.7;
  const gap = s * 0.06;
  const total = n * w + (n - 1) * gap;
  const start = cx - total / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#eaffe1';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const x = start + i * (w + gap);
    ctx.fillRect(x, cy - h / 2, w, h);
    ctx.strokeRect(x + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
  }
}

function drawOakLeaf(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#eaffe1';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const radiusPhase = Math.cos(a * 3) * 0.18 + 1;
    const r = s * 0.38 * radiusPhase;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.8;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // central vein
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.3);
  ctx.lineTo(cx, cy + s * 0.3);
  ctx.stroke();
}

function drawEagle(ctx, cx, cy, s) {
  // Simplified "wings spread" silhouette.
  ctx.fillStyle = '#eaffe1';
  ctx.strokeStyle = '#ffd070';
  ctx.lineWidth = 1.5;
  const span = s * 0.44;
  ctx.beginPath();
  ctx.moveTo(cx - span, cy);
  ctx.quadraticCurveTo(cx - span * 0.55, cy - span * 0.55, cx, cy - span * 0.1);
  ctx.quadraticCurveTo(cx + span * 0.55, cy - span * 0.55, cx + span, cy);
  ctx.quadraticCurveTo(cx + span * 0.5, cy + span * 0.2, cx, cy + span * 0.1);
  ctx.quadraticCurveTo(cx - span * 0.5, cy + span * 0.2, cx - span, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(cx, cy - span * 0.2, span * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawStars(ctx, cx, cy, s, n) {
  const r = s * 0.18;
  const totalW = n * r * 2 + (n - 1) * r * 0.6;
  const start = cx - totalW / 2 + r;
  for (let i = 0; i < n; i++) {
    drawStar(ctx, start + i * (r * 2.6), cy, r, '#ffd070');
  }
}

function drawStar(ctx, cx, cy, radius, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#eaffe1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
