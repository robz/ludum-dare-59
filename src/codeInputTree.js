// Tree morse-code interface: renders the complete English morse code tree.
// As the player types, nodes in the active path (root → current) are
// highlighted; descendants of the current node stay at normal opacity; all
// remaining nodes fade (no longer reachable from the current position).
//
// Orientation-aware: portrait = tree grows downward (bottom panel);
// landscape = tree grows rightward (left panel). Fonts scale to fill space.

import { CODE_TO_LETTER, codeToLetter } from './morse.js';

const DEPTHS = 5; // root + 4 morse depths
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

  draw(ctx, rect, { isPressed = false, orientation = 'auto' } = {}) {
    const { x, y, w, h } = rect;
    const landscape = orientation === 'landscape' || (orientation === 'auto' && w >= h);

    ctx.save();
    ctx.fillStyle = 'rgba(5, 16, 8, 0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = 'rgba(140, 255, 170, 0.65)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TRANSMIT', x + 10, y + 8);

    // Current code label
    ctx.textAlign = 'right';
    ctx.fillStyle = this.currentCode.length ? '#b6ffc4' : 'rgba(140, 255, 170, 0.4)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(this.currentCode || '·', x + w - 10, y + 8);

    const padTop = 28;
    const padSide = 10;
    const innerX = x + padSide;
    const innerY = y + padTop;
    const innerW = w - padSide * 2;
    const innerH = h - padTop - 10;

    const positions = computePositions(landscape, innerX, innerY, innerW, innerH);
    const r = computeRadius(landscape, innerW, innerH);
    const labelFont = Math.max(11, Math.round(r * 1.0));
    const codeFont = Math.max(9, Math.round(r * 0.68));

    drawConnections(ctx, positions, this.currentCode);
    drawNodes(ctx, positions, this.currentCode, this.usedLetters, r, labelFont, codeFont, isPressed);

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

function computeRadius(landscape, w, h) {
  // Radius must fit both the deepest layer and the depth axis.
  const depthAxis = landscape ? w : h;
  const slotAxis = landscape ? h : w;
  const depthCell = depthAxis / DEPTHS;
  const leafSlot = slotAxis / 16; // at depth 4 there are 16 slot positions
  return Math.max(8, Math.floor(Math.min(depthCell * 0.38, leafSlot * 0.46)));
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
  if (currentCode.startsWith(code)) return 'ancestor'; // code is a strict prefix of current
  if (code.startsWith(currentCode)) return 'reachable'; // descendant of current
  return 'unreachable';
}

function drawConnections(ctx, positions, currentCode) {
  ctx.save();
  for (let depth = 1; depth < DEPTHS; depth++) {
    const count = 1 << depth;
    for (let i = 0; i < count; i++) {
      const code = indexToCode(i, depth);
      const parentCode = code.slice(0, -1);
      const letter = CODE_TO_LETTER[code];
      const parentLetter = depth === 1 ? 'START' : CODE_TO_LETTER[parentCode];
      if (!letter || !parentLetter) continue;
      const child = positions[code];
      const parent = positions[parentCode];
      const cClass = classify(code, currentCode);
      const pClass = classify(parentCode, currentCode);
      const onActivePath = (cClass === 'current' || cClass === 'ancestor')
        && (pClass === 'current' || pClass === 'ancestor');
      const faded = cClass === 'unreachable' || pClass === 'unreachable';
      ctx.strokeStyle = onActivePath
        ? 'rgba(200, 255, 220, 0.9)'
        : (faded ? 'rgba(80, 220, 110, 0.1)' : 'rgba(80, 220, 110, 0.4)');
      ctx.lineWidth = onActivePath ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(parent.x, parent.y);
      ctx.lineTo(child.x, child.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawNodes(ctx, positions, currentCode, used, r, labelFont, codeFont, isPressed) {
  for (let depth = 0; depth < DEPTHS; depth++) {
    const count = 1 << depth;
    for (let i = 0; i < count; i++) {
      const code = indexToCode(i, depth);
      const label = depth === 0 ? 'START' : CODE_TO_LETTER[code];
      if (!label) continue;
      const pos = positions[code];
      const state = classify(code, currentCode);
      drawNode(ctx, pos.x, pos.y, r, label, code, state, used.has(label), isPressed && state === 'current', labelFont, codeFont);
    }
  }
}

function drawNode(ctx, cx, cy, r, label, code, state, isUsed, isPressed, labelFont, codeFont) {
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
  if (isPressed) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#b6ffc4';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = isRoot ? Math.max(9, Math.round(labelFont * 0.7)) : labelFont;
  ctx.font = `bold ${fs}px monospace`;
  ctx.fillText(label, cx, cy + 1);

  if (code) {
    ctx.font = `${codeFont}px monospace`;
    ctx.fillStyle = state === 'unreachable'
      ? 'rgba(166, 214, 176, 0.9)'
      : (state === 'current' || state === 'ancestor' ? '#eaffe1' : '#8fffa1');
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
