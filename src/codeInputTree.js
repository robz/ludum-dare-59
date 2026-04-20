// Tree morse-code interface: renders the complete English morse code tree.
// As the player types, nodes in the active path (root → current) are
// highlighted; descendants of the current node stay at normal opacity; all
// remaining nodes fade (no longer reachable from the current position).
//
// While the player is holding their key, a dial arm sweeps behind the
// current node — clockwise in landscape (12 → 3 → 6), counter-clockwise
// in portrait (9 → 6 → 3). Its midway (3 o'clock / 6 o'clock) marks the
// dot-to-dash threshold. The corresponding child connection line is lit.

import { CODE_TO_LETTER, codeToLetter } from './morse.js';

const DEPTHS = 5;
const FLASH_MS = 700;

export class CodeInputTree {
  constructor() {
    this.currentCode = '';
    this.flashLetter = null;
    this.flashIsFail = false;
    this.flashElapsed = 0;
    this.usedLetters = new Set();
  }

  advance(symbol) { this.currentCode += symbol; }
  reset() { this.currentCode = ''; }

  resetFlash(letter, success = true) {
    this.flashLetter = letter;
    this.flashIsFail = !success;
    this.flashElapsed = 0;
    this.currentCode = '';
  }

  update(dt) {
    if (this.flashLetter) {
      this.flashElapsed += dt * 1000;
      if (this.flashElapsed >= FLASH_MS) this.flashLetter = null;
    }
  }

  markUsed(letter) { if (letter) this.usedLetters.add(letter); }
  getUsedLetters() { return this.usedLetters; }
  getCurrentCode() { return this.currentCode; }
  getCurrentLetter() { return codeToLetter(this.currentCode); }

  draw(ctx, rect, opts = {}) {
    const {
      isPressed = false,
      pressStartTime = null,
      unit = 100,
      cutoff = 0.8,
      now = (typeof performance !== 'undefined') ? performance.now() : 0,
      orientation = 'auto',
    } = opts;
    const { x, y, w, h } = rect;
    const landscape = orientation === 'landscape' || (orientation === 'auto' && w >= h);

    ctx.save();
    ctx.fillStyle = 'rgba(5, 16, 8, 0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Current code label (no "TRANSMIT" title — left blank for clarity)
    ctx.textAlign = 'right';
    ctx.fillStyle = this.currentCode.length ? '#b6ffc4' : 'rgba(140, 255, 170, 0.4)';
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(this.currentCode || '·', x + w - 10, y + 8);

    const padTop = 24;
    const padSide = 10;
    const innerX = x + padSide;
    const innerY = y + padTop;
    const innerW = w - padSide * 2;
    const innerH = h - padTop - 10;

    const positions = computePositions(landscape, innerX, innerY, innerW, innerH);
    const r = computeRadius(landscape, innerW, innerH);
    const labelFont = Math.max(11, Math.round(r * 1.0));
    const codeFont = Math.max(9, Math.round(r * 0.7));

    // Dial progress (0..1) — midway corresponds to dot/dash threshold.
    const dialT = (isPressed && pressStartTime !== null)
      ? computeDialT(now - pressStartTime, unit, cutoff)
      : null;

    drawConnections(ctx, positions, this.currentCode, dialT);
    drawNodes(ctx, positions, this.currentCode, this.usedLetters, r, labelFont, codeFont, landscape);

    // Dial draw (behind letter is fine — drawn before letters won't work since
    // letters already drew; instead draw dial as a thin arm overlaying. Its
    // arm extends 50% beyond the node.)
    if (dialT !== null) {
      const current = positions[this.currentCode];
      if (current) drawDial(ctx, current.x, current.y, r, dialT, landscape);
    }

    if (this.flashLetter) {
      const ft = this.flashElapsed / FLASH_MS;
      const alpha = 1 - ft;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `bold ${Math.round(Math.min(w, h) * 0.4)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.flashIsFail ? '#ff6a6a' : '#b6ffc4';
      ctx.fillText(this.flashLetter, x + w / 2, y + h / 2);
      ctx.restore();
    }

    ctx.restore();
  }
}

function computeDialT(elapsedMs, unit, cutoff) {
  // Midway at dot/dash threshold (cutoff * 3 * unit).
  const threshold = cutoff * 3 * unit;
  const fullSweep = 2 * threshold; // 6 * cutoff * unit
  return Math.max(0, Math.min(1, elapsedMs / fullSweep));
}

function drawDial(ctx, cx, cy, r, t, landscape) {
  const dialR = r * 1.5;
  let angle;
  if (landscape) {
    // 12 → 3 → 6, clockwise. Angle in canvas: -π/2 → 0 → π/2.
    angle = -Math.PI / 2 + t * Math.PI;
  } else {
    // Portrait: 9 → 6 → 3 counter-clockwise.
    // 9 o'clock = π, 6 o'clock = π/2, 3 o'clock = 0. Decreasing angle in canvas.
    angle = Math.PI - t * Math.PI;
  }
  ctx.save();
  // Soft glow
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#b6ffc4';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * dialR, cy + Math.sin(angle) * dialR);
  ctx.stroke();
  // Crisp arm
  ctx.globalAlpha = 1;
  ctx.strokeStyle = t < 0.5 ? '#b6ffc4' : '#ffd070';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * dialR, cy + Math.sin(angle) * dialR);
  ctx.stroke();
  // Tip
  ctx.fillStyle = t < 0.5 ? '#b6ffc4' : '#ffd070';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(angle) * dialR, cy + Math.sin(angle) * dialR, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function computeRadius(landscape, w, h) {
  const depthAxis = landscape ? w : h;
  const slotAxis = landscape ? h : w;
  const depthCell = depthAxis / DEPTHS;
  const leafSlot = slotAxis / 16;
  return Math.max(9, Math.floor(Math.min(depthCell * 0.38, leafSlot * 0.46)));
}

function computePositions(landscape, x, y, w, h) {
  const positions = {};
  for (let depth = 0; depth < DEPTHS; depth++) {
    const count = 1 << depth;
    for (let i = 0; i < count; i++) {
      const code = indexToCode(i, depth);
      let nx, ny;
      if (landscape) {
        nx = x + ((depth + 0.5) / DEPTHS) * w;
        ny = y + ((i + 0.5) / count) * h;
      } else {
        nx = x + ((i + 0.5) / count) * w;
        ny = y + ((depth + 0.5) / DEPTHS) * h;
      }
      positions[code] = { x: nx, y: ny, depth, index: i };
    }
  }
  return positions;
}

function classify(code, currentCode) {
  if (code === currentCode) return 'current';
  if (currentCode.startsWith(code)) return 'ancestor';
  if (code.startsWith(currentCode)) return 'reachable';
  return 'unreachable';
}

function drawConnections(ctx, positions, currentCode, dialT) {
  ctx.save();
  const dotChildCode = currentCode + '.';
  const dashChildCode = currentCode + '-';
  for (let depth = 1; depth < DEPTHS; depth++) {
    const count = 1 << depth;
    for (let i = 0; i < count; i++) {
      const code = indexToCode(i, depth);
      const parentCode = code.slice(0, -1);
      const letter = CODE_TO_LETTER[code];
      const parentLabel = depth === 1 ? 'START' : CODE_TO_LETTER[parentCode];
      if (!letter || !parentLabel) continue;
      const child = positions[code];
      const parent = positions[parentCode];
      const cClass = classify(code, currentCode);
      const pClass = classify(parentCode, currentCode);
      const onActivePath = (cClass === 'current' || cClass === 'ancestor')
        && (pClass === 'current' || pClass === 'ancestor');
      const faded = cClass === 'unreachable' || pClass === 'unreachable';
      // Dial pre-selection highlight
      let preSelect = false;
      if (dialT !== null && parentCode === currentCode) {
        if (code === dotChildCode && dialT < 0.5) preSelect = true;
        if (code === dashChildCode && dialT >= 0.5) preSelect = true;
      }
      ctx.strokeStyle = preSelect
        ? (dialT < 0.5 ? '#b6ffc4' : '#ffd070')
        : onActivePath
          ? 'rgba(200, 255, 220, 0.9)'
          : (faded ? 'rgba(80, 220, 110, 0.1)' : 'rgba(80, 220, 110, 0.4)');
      ctx.lineWidth = preSelect ? 2.5 : (onActivePath ? 2 : 1);
      ctx.beginPath();
      ctx.moveTo(parent.x, parent.y);
      ctx.lineTo(child.x, child.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawNodes(ctx, positions, currentCode, used, r, labelFont, codeFont, landscape) {
  for (let depth = 0; depth < DEPTHS; depth++) {
    const count = 1 << depth;
    for (let i = 0; i < count; i++) {
      const code = indexToCode(i, depth);
      const label = depth === 0 ? 'START' : CODE_TO_LETTER[code];
      if (!label) continue;
      const pos = positions[code];
      const state = classify(code, currentCode);
      drawNode(ctx, pos.x, pos.y, r, label, code, state, used.has(label), labelFont, codeFont, landscape);
    }
  }
}

function drawNode(ctx, cx, cy, r, label, code, state, isUsed, labelFont, codeFont, landscape) {
  const alpha = state === 'unreachable' ? 0.22 : 1;
  const isRoot = label === 'START';
  let fill, stroke, textColor, borderWidth = 1.5;
  if (state === 'current') {
    fill = 'rgba(120, 255, 160, 0.75)';
    stroke = '#ffffff';
    textColor = '#05140a';
    borderWidth = 2.5;
  } else if (state === 'ancestor') {
    fill = 'rgba(80, 255, 120, 0.45)';
    stroke = '#d0ffd8';
    textColor = '#ffffff';
    borderWidth = 2;
  } else if (state === 'reachable') {
    fill = isUsed ? 'rgba(80, 220, 110, 0.28)' : 'rgba(10, 28, 15, 0.92)';
    stroke = isUsed ? '#b6ffc4' : '#4eff6d';
    textColor = '#eaffe1';
  } else {
    fill = 'rgba(10, 28, 15, 0.6)';
    stroke = '#3c8850';
    textColor = '#a6d6b0';
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';

  if (!isRoot && !landscape) {
    // Portrait: render letter and code stacked inside the circle to avoid
    // overcrowding at the bottom row.
    const letterFs = Math.max(10, Math.round(r * 0.88));
    const codeFs = Math.max(8, Math.round(r * 0.58));
    ctx.textBaseline = 'alphabetic';
    ctx.font = `bold ${letterFs}px monospace`;
    ctx.fillText(label, cx, cy - r * 0.12);
    ctx.font = `bold ${codeFs}px monospace`;
    ctx.fillStyle = state === 'current'
      ? '#05140a'
      : (state === 'ancestor' ? '#eaffe1' : '#8fffa1');
    ctx.fillText(code, cx, cy + r * 0.78);
  } else {
    ctx.textBaseline = 'middle';
    const fs = isRoot ? Math.max(9, Math.round(labelFont * 0.7)) : labelFont;
    ctx.font = `bold ${fs}px monospace`;
    ctx.fillText(label, cx, cy + 1);
    if (code && landscape) {
      ctx.font = `${codeFont}px monospace`;
      ctx.fillStyle = state === 'current'
        ? '#05140a'
        : (state === 'ancestor' ? '#eaffe1' : '#8fffa1');
      ctx.textBaseline = 'top';
      ctx.fillText(code, cx, cy + r + 3);
    }
  }
  ctx.restore();
}

function indexToCode(index, depth) {
  let code = '';
  for (let i = depth - 1; i >= 0; i--) code += ((index >> i) & 1) ? '-' : '.';
  return code;
}
