// Morse code tree help overlay. Nodes already used to destroy an enemy
// are highlighted. All drawing happens on the canvas.

import { CODE_TO_LETTER } from './morse.js';

export function drawHelp(ctx, rect, usedLetters) {
  const { x, y, w, h } = rect;
  ctx.fillStyle = 'rgba(0, 10, 5, 0.82)';
  ctx.fillRect(x, y, w, h);

  const mw = Math.min(w * 0.92, 960);
  const mh = Math.min(h * 0.92, 720);
  const mx = x + (w - mw) / 2;
  const my = y + (h - mh) / 2;

  ctx.fillStyle = 'rgba(6, 20, 10, 0.96)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#4eff6d';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

  ctx.fillStyle = '#b6ffc4';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('MORSE CODE TREE', mx + mw / 2, my + 18);

  const treeX = mx + 30;
  const treeY = my + 66;
  const treeW = mw - 60;
  const treeH = mh - 120;
  drawTree(ctx, treeX, treeY, treeW, treeH, usedLetters);

  ctx.fillStyle = 'rgba(180, 255, 200, 0.7)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('press H or ESC to close', mx + mw / 2, my + mh - 24);
}

function drawTree(ctx, x, y, w, h, used) {
  const rows = [0, 0.13, 0.33, 0.56, 0.87];
  const rowY = rows.map(f => y + f * h);

  // Root node
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
      ctx.lineWidth = isUsed ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(parentX, parentY + 20);
      ctx.lineTo(nx, ny - 20);
      ctx.stroke();
      drawNode(ctx, nx, ny, letter, code, isUsed, 1);
    }
  }
}

function drawNode(ctx, cx, cy, label, code, highlighted, scale) {
  const isRoot = label === 'START';
  const r = (isRoot ? 26 : 20) * scale;
  ctx.save();
  ctx.fillStyle = highlighted ? 'rgba(120, 255, 160, 0.45)' : 'rgba(10, 28, 15, 0.95)';
  ctx.strokeStyle = highlighted ? '#d0ffd8' : (isRoot ? '#b6ffc4' : '#4eff6d');
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#eaffe1';
  ctx.font = `bold ${isRoot ? 12 : 18}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
  if (code) {
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = highlighted ? '#d0ffd8' : '#8fffa1';
    ctx.textBaseline = 'top';
    ctx.fillText(code, cx, cy + r + 4);
  }
  ctx.restore();
}

function indexToCode(index, depth) {
  let code = '';
  for (let i = depth - 1; i >= 0; i--) {
    code += ((index >> i) & 1) ? '-' : '.';
  }
  return code;
}

function codeToIndex(code) {
  let idx = 0;
  for (const ch of code) idx = (idx << 1) | (ch === '-' ? 1 : 0);
  return idx;
}
