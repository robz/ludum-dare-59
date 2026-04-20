// Help overlay: morse code tree plus a cycleable "how morse code works"
// explanation. Use arrow keys to rotate through the explainer variants.

import { CODE_TO_LETTER, LETTER_TO_CODE } from './morse.js';

export const EXPLAINER_COUNT = 2;

export function drawHelp(ctx, rect, { usedLetters = new Set(), explainer = 0, isTouch = false, unitMs = 100 } = {}) {
  const { x, y, w, h } = rect;
  ctx.fillStyle = 'rgba(0, 10, 5, 0.82)';
  ctx.fillRect(x, y, w, h);

  const mw = Math.min(w * 0.94, 1080);
  const mh = Math.min(h * 0.94, 780);
  const mx = x + (w - mw) / 2;
  const my = y + (h - mh) / 2;

  ctx.fillStyle = 'rgba(6, 20, 10, 0.96)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#4eff6d';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

  ctx.fillStyle = '#b6ffc4';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('HELP', mx + mw / 2, my + 14);

  // Instruction line under the title — always visible regardless of variant.
  ctx.fillStyle = '#ffd070';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(
    isTouch
      ? 'Tap to send a dot ·    Hold down longer to send a dash —'
      : 'Tap to send a dot ·    Hold down longer to send a dash —',
    mx + mw / 2, my + 46
  );

  const padX = 24;
  const headerY = my + 80;
  const explainerH = Math.round(mh * 0.34);
  const explainerRect = {
    x: mx + padX, y: headerY,
    w: mw - 2 * padX, h: explainerH,
  };
  const treeRect = {
    x: mx + padX, y: headerY + explainerH + 16,
    w: mw - 2 * padX, h: mh - (headerY - my) - explainerH - 44,
  };

  drawExplainerFrame(ctx, explainerRect, explainer, { unitMs });
  drawTreeSection(ctx, treeRect, usedLetters);

  ctx.fillStyle = 'rgba(180, 255, 200, 0.7)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('←/→ cycle explanation   ·   H or ESC to close', mx + mw / 2, my + mh - 22);
}

function drawExplainerFrame(ctx, rect, index, { unitMs = 100 } = {}) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 28, 15, 0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = '#b6ffc4';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`HOW MORSE CODE WORKS  ·  ${index + 1}/${EXPLAINER_COUNT}`, x + 14, y + 10);

  // Page dots
  const pdx = x + w - 14 - EXPLAINER_COUNT * 14;
  for (let i = 0; i < EXPLAINER_COUNT; i++) {
    ctx.fillStyle = i === index ? '#b6ffc4' : 'rgba(120, 220, 150, 0.35)';
    ctx.beginPath();
    ctx.arc(pdx + i * 14 + 6, y + 18, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const inner = { x: x + 14, y: y + 36, w: w - 28, h: h - 46 };
  const variant = EXPLAINER_VARIANTS[index % EXPLAINER_COUNT];
  variant(ctx, inner, { unitMs });
  ctx.restore();
}

// ------------- Explainer variants -------------

const EXPLAINER_VARIANTS = [
  drawVariantTimeline,
  drawVariantAnatomy,
];

function drawVariantTimeline(ctx, rect, { unitMs = 100 } = {}) {
  // "A TV" rendered to scale: 1-unit dots, 3-unit dashes, 1-unit intra-letter
  // gaps, 3-unit inter-letter gaps, 7-unit word gap.
  const { x, y, w, h } = rect;

  // Unit-length key in the top-right of this card.
  ctx.save();
  ctx.fillStyle = '#ffd070';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`1 unit = ${Math.round(unitMs)} ms (adjust in settings)`, x + w, y);
  ctx.restore();

  // Total units in "A TV":
  //   A = dot + 1 + dash         (1 + 1 + 3)                = 5 units
  //   word gap (A → T)                                      = 7 units
  //   T = dash                   (3)                        = 3 units
  //   char gap (T → V)                                      = 3 units
  //   V = dot + 1 + dot + 1 + dot + 1 + dash  (1+1+1+1+1+1+3) = 9 units
  //   --------------------------------------------------------
  //   Total                                                 = 27 units
  const TOTAL_UNITS = 27;
  // Pick a unit width that fits inside the rect (with side padding for callout labels).
  const leftPad = 24, rightPad = 24;
  const unit = Math.floor((w - leftPad - rightPad) / TOTAL_UNITS);
  const barH = 30;
  const baseY = y + h * 0.58;
  const startX = x + leftPad;
  let tx = startX;

  ctx.save();
  const seq = [
    { sym: '.' }, { gap: 1 }, { sym: '-' },
    { gap: 7, boundary: 'word' },
    { sym: '-' },
    { gap: 3, boundary: 'char' },
    { sym: '.' }, { gap: 1 }, { sym: '.' }, { gap: 1 }, { sym: '.' }, { gap: 1 }, { sym: '-' },
  ];

  const barSpans = [];
  const gapSpans = [];
  for (const e of seq) {
    if (e.sym) {
      const widthUnits = e.sym === '-' ? 3 : 1;
      barSpans.push({ x: tx, w: widthUnits * unit, sym: e.sym });
      tx += widthUnits * unit;
    } else {
      gapSpans.push({ x: tx, w: e.gap * unit, boundary: e.boundary, units: e.gap });
      tx += e.gap * unit;
    }
  }

  // Draw bars
  for (const b of barSpans) {
    ctx.fillStyle = '#6afc90';
    ctx.fillRect(b.x, baseY, b.w, barH);
  }

  // Letter labels above
  ctx.fillStyle = '#eaffe1';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const labelY = baseY - 8;
  // A spans barSpans[0..1], T is barSpans[2], V spans barSpans[3..6]
  const aCenter = (barSpans[0].x + barSpans[1].x + barSpans[1].w) / 2;
  const tCenter = barSpans[2].x + barSpans[2].w / 2;
  const vCenter = (barSpans[3].x + barSpans[6].x + barSpans[6].w) / 2;
  ctx.fillText('A', aCenter, labelY);
  ctx.fillText('T', tCenter, labelY);
  ctx.fillText('V', vCenter, labelY);

  // Brackets under each letter
  ctx.strokeStyle = 'rgba(180, 255, 200, 0.55)';
  ctx.lineWidth = 1;
  const brackets = [
    [barSpans[0].x,                   barSpans[1].x + barSpans[1].w], // A
    [barSpans[2].x,                   barSpans[2].x + barSpans[2].w], // T
    [barSpans[3].x,                   barSpans[6].x + barSpans[6].w], // V
  ];
  for (const [s, e] of brackets) {
    ctx.beginPath();
    ctx.moveTo(s, baseY + barH + 2);
    ctx.lineTo(s, baseY + barH + 6);
    ctx.lineTo(e, baseY + barH + 6);
    ctx.lineTo(e, baseY + barH + 2);
    ctx.stroke();
  }

  // Callouts: dot, dash, symbol gap, letter gap, word gap
  const callouts = [
    { tx: barSpans[0].x + barSpans[0].w / 2,          ty: baseY,        lx: barSpans[0].x + barSpans[0].w / 2,          ly: baseY - 54, text: 'DOT\n1 unit', color: '#6afc90' },
    { tx: barSpans[1].x + barSpans[1].w / 2,          ty: baseY,        lx: barSpans[1].x + barSpans[1].w / 2,          ly: baseY - 54, text: 'DASH\n3 units', color: '#6afc90' },
    { tx: gapSpans[0].x + gapSpans[0].w / 2,          ty: baseY + barH, lx: gapSpans[0].x + gapSpans[0].w / 2,          ly: baseY + barH + 30, text: 'symbol gap · 1u', color: '#a7cfff', below: true },
    { tx: gapSpans[1].x + gapSpans[1].w / 2,          ty: baseY + barH / 2, lx: gapSpans[1].x + gapSpans[1].w / 2,      ly: baseY + barH + 54, text: 'word gap · 7 units', color: '#ffd070', below: true },
    { tx: gapSpans[2].x + gapSpans[2].w / 2,          ty: baseY + barH, lx: gapSpans[2].x + gapSpans[2].w / 2,          ly: baseY + barH + 30, text: 'letter gap · 3 units', color: '#a7cfff', below: true },
  ];

  for (const c of callouts) {
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.tx, c.ty);
    ctx.lineTo(c.lx, c.ly);
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = c.below ? 'top' : 'bottom';
    const lines = c.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ly = c.below
        ? c.ly + 4 + i * 13
        : c.ly - 4 - (lines.length - 1 - i) * 13;
      ctx.fillText(lines[i], c.lx, ly);
    }
  }

  // Word-gap highlight: show the 7-unit span explicitly with tick marks
  const wgap = gapSpans[1];
  ctx.strokeStyle = 'rgba(255, 208, 112, 0.45)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(wgap.x, baseY - 4);
  ctx.lineTo(wgap.x + wgap.w, baseY - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  // Mini unit ticks along the word gap
  ctx.strokeStyle = 'rgba(255, 208, 112, 0.55)';
  for (let i = 0; i <= 7; i++) {
    const px = wgap.x + i * unit;
    ctx.beginPath();
    ctx.moveTo(px, baseY - 8);
    ctx.lineTo(px, baseY - 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawVariantAnatomy(ctx, rect) {
  // Letter-anatomy grid. Shows 6 example letters, each with its morse bars
  // drawn to scale and labeled.
  const { x, y, w, h } = rect;
  const examples = ['E', 'T', 'A', 'N', 'S', 'O'];
  const cols = 3;
  const rows = 2;
  const cellW = w / cols;
  const cellH = h / rows;
  const unit = Math.max(9, Math.min(16, Math.floor((cellW - 60) / 10)));
  const barH = 18;

  ctx.save();
  for (let i = 0; i < examples.length; i++) {
    const letter = examples[i];
    const code = LETTER_TO_CODE[letter];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * cellW + cellW / 2;
    const cy = y + row * cellH + cellH / 2;

    ctx.fillStyle = '#eaffe1';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + col * cellW + 36, cy);

    let tx = x + col * cellW + 66;
    const by = cy - barH / 2;
    for (let j = 0; j < code.length; j++) {
      const sym = code[j];
      const wU = sym === '-' ? 3 : 1;
      ctx.fillStyle = '#6afc90';
      ctx.fillRect(tx, by, wU * unit, barH);
      tx += wU * unit;
      if (j < code.length - 1) tx += unit;
    }
    ctx.fillStyle = '#8fffa1';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(code, x + col * cellW + 66, by + barH + 4);
  }
  ctx.fillStyle = 'rgba(200, 255, 210, 0.75)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Short = dot (1 unit), long = dash (3 units). Every symbol inside a letter is separated by 1 unit of silence.', x, y + h - 14);
  ctx.restore();
}

// ------------- Tree section (bottom of help modal) -------------

function drawTreeSection(ctx, rect, usedLetters) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 28, 15, 0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = '#b6ffc4';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('MORSE CODE TREE', x + 14, y + 8);

  drawTree(ctx, x + 12, y + 32, w - 24, h - 44, usedLetters);
  ctx.restore();
}

function drawTree(ctx, x, y, w, h, used) {
  const rows = [0, 0.13, 0.33, 0.56, 0.87];
  const rowY = rows.map(f => y + f * h);
  drawNode(ctx, x + w / 2, rowY[0], 'START', '', false, 1.0);
  for (let depth = 1; depth <= 4; depth++) {
    const count = 1 << depth;
    for (let i = 0; i < count; i++) {
      const code = indexToCode(i, depth);
      const letter = CODE_TO_LETTER[code];
      if (!letter) continue;
      const nx = x + ((i + 0.5) / count) * w;
      const ny = rowY[depth];
      const parentCode = code.slice(0, -1);
      const parentDepth = parentCode.length;
      const parentIndex = codeToIndex(parentCode);
      const parentX = parentDepth === 0
        ? x + w / 2
        : x + ((parentIndex + 0.5) / (1 << parentDepth)) * w;
      const parentY = rowY[parentDepth];
      const isUsed = used.has(letter);
      ctx.strokeStyle = isUsed ? 'rgba(180, 255, 200, 0.8)' : 'rgba(80, 220, 110, 0.3)';
      ctx.lineWidth = isUsed ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(parentX, parentY + 16);
      ctx.lineTo(nx, ny - 16);
      ctx.stroke();
      drawNode(ctx, nx, ny, letter, code, isUsed, 1);
    }
  }
}

function drawNode(ctx, cx, cy, label, code, highlighted, scale) {
  const isRoot = label === 'START';
  const r = (isRoot ? 19 : 16) * scale;
  ctx.save();
  ctx.fillStyle = highlighted ? 'rgba(120, 255, 160, 0.45)' : 'rgba(10, 28, 15, 0.95)';
  ctx.strokeStyle = highlighted ? '#d0ffd8' : (isRoot ? '#b6ffc4' : '#4eff6d');
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#eaffe1';
  ctx.font = `bold ${isRoot ? 11 : 15}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
  if (code) {
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = highlighted ? '#d0ffd8' : '#8fffa1';
    ctx.textBaseline = 'top';
    ctx.fillText(code, cx, cy + r + 3);
  }
  ctx.restore();
}

function indexToCode(index, depth) {
  let code = '';
  for (let i = depth - 1; i >= 0; i--) code += ((index >> i) & 1) ? '-' : '.';
  return code;
}

function codeToIndex(code) {
  let idx = 0;
  for (const ch of code) idx = (idx << 1) | (ch === '-' ? 1 : 0);
  return idx;
}
