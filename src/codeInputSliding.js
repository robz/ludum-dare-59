// Sliding morse-code-tree interface.
// Displays the three nodes directly in view (left child, current, right child)
// and animates the slide when a new dot or dash is entered.
//
// This module is rendering-only; it does not handle input or timing.

import { codeToLetter, childOf } from './morse.js';

const ANIM_MS = 260;
const FLASH_MS = 700;

export class CodeInputSliding {
  constructor() {
    this.currentCode = '';
    this.prevCode = '';
    this.lastSymbol = null;
    this.animElapsed = ANIM_MS;
    this.flashLetter = null;
    this.flashIsFail = false;
    this.flashElapsed = 0;
    this.usedLetters = new Set();
  }

  advance(symbol) {
    this.prevCode = this.currentCode;
    this.currentCode += symbol;
    this.lastSymbol = symbol;
    this.animElapsed = 0;
  }

  resetFlash(letter, success = true) {
    this.flashLetter = letter;
    this.flashIsFail = !success;
    this.flashElapsed = 0;
    this.prevCode = this.currentCode;
    this.currentCode = '';
    this.lastSymbol = null;
    this.animElapsed = ANIM_MS;
  }

  reset() {
    this.prevCode = this.currentCode;
    this.currentCode = '';
    this.lastSymbol = null;
    this.animElapsed = ANIM_MS;
  }

  update(dt) {
    if (this.animElapsed < ANIM_MS) {
      this.animElapsed = Math.min(ANIM_MS, this.animElapsed + dt * 1000);
    }
    if (this.flashLetter) {
      this.flashElapsed += dt * 1000;
      if (this.flashElapsed >= FLASH_MS) this.flashLetter = null;
    }
  }

  markUsed(letter) { if (letter) this.usedLetters.add(letter); }
  getUsedLetters() { return this.usedLetters; }
  getCurrentCode() { return this.currentCode; }
  getCurrentLetter() { return codeToLetter(this.currentCode); }

  draw(ctx, rect, { isPressed = false, currentCode = null } = {}) {
    const { x, y, w, h } = rect;
    const code = currentCode ?? this.currentCode;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 16, 8, 0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const midY = y + h * 0.42;
    const cx = x + w * 0.5;
    const spacing = Math.min(w * 0.23, 150);
    const leftX = cx - spacing;
    const rightX = cx + spacing;
    const farL = cx - spacing * 2.5;
    const farR = cx + spacing * 2.5;

    const p = this.animElapsed / ANIM_MS;
    const e = easeOutCubic(p);
    const animating = p < 1;

    if (!animating) {
      drawConnections(ctx, cx, midY, leftX, rightX, 1);
      renderNodeAt(ctx, leftX, midY, childNode(code, '.'), this, 0.9, 0.7);
      renderNodeAt(ctx, cx, midY, centerNode(code), this, 1.2, 1);
      renderNodeAt(ctx, rightX, midY, childNode(code, '-'), this, 0.9, 0.7);
      if (isPressed) drawPressGlow(ctx, cx, midY);
    } else {
      const sym = this.lastSymbol;
      const oldC = centerNode(this.prevCode);
      const oldL = childNode(this.prevCode, '.');
      const oldR = childNode(this.prevCode, '-');
      const newL = childNode(code, '.');
      const newR = childNode(code, '-');
      drawConnections(ctx, cx, midY, leftX, rightX, e);
      if (sym === '.') {
        renderNodeAt(ctx, lerp(leftX, cx, e), midY, oldL, this, 0.9 + 0.3 * e, 0.7 + 0.3 * e);
        renderNodeAt(ctx, lerp(cx, rightX, e), midY, oldC, this, 1.2 - 0.3 * e, 1 - e);
        renderNodeAt(ctx, lerp(rightX, farR, e), midY, oldR, this, 0.9, 0.7 * (1 - e));
        renderNodeAt(ctx, lerp(farL, leftX, e), midY, newL, this, 0.9, 0.7 * e);
        renderNodeAt(ctx, rightX, midY, newR, this, 0.9, 0.7 * e);
      } else {
        renderNodeAt(ctx, lerp(rightX, cx, e), midY, oldR, this, 0.9 + 0.3 * e, 0.7 + 0.3 * e);
        renderNodeAt(ctx, lerp(cx, leftX, e), midY, oldC, this, 1.2 - 0.3 * e, 1 - e);
        renderNodeAt(ctx, lerp(leftX, farL, e), midY, oldL, this, 0.9, 0.7 * (1 - e));
        renderNodeAt(ctx, leftX, midY, newL, this, 0.9, 0.7 * e);
        renderNodeAt(ctx, lerp(farR, rightX, e), midY, newR, this, 0.9, 0.7 * e);
      }
    }

    const codeY = y + h * 0.82;
    ctx.font = '22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(120, 255, 160, 0.9)';
    ctx.fillText(code.length ? code : '·', cx, codeY);

    if (this.flashLetter) {
      const ft = this.flashElapsed / FLASH_MS;
      const alpha = 1 - ft;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `bold ${86 + ft * 50}px monospace`;
      ctx.fillStyle = this.flashIsFail ? '#ff6a6a' : '#b6ffc4';
      ctx.fillText(this.flashLetter, cx, midY);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

function centerNode(code) {
  if (code === '') return { letter: 'START', code: '', isStart: true };
  const letter = codeToLetter(code);
  return letter ? { letter, code } : { letter: '?', code, invalid: true };
}

function childNode(code, symbol) {
  const letter = childOf(code, symbol);
  if (!letter) return null;
  return { letter, code: code + symbol };
}

function renderNodeAt(ctx, cx, cy, node, codeInput, scale, alpha) {
  if (!node || alpha <= 0.01) return;
  const r = 30 * scale;
  const used = codeInput.usedLetters.has(node.letter);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = node.isStart
    ? 'rgba(30, 70, 40, 0.95)'
    : (used ? 'rgba(80, 255, 120, 0.4)' : 'rgba(10, 28, 15, 0.95)');
  ctx.strokeStyle = node.invalid ? '#ff6a6a' : (used ? '#d0ffd8' : '#4eff6d');
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = node.invalid ? '#ffb3b3' : '#eaffe1';
  ctx.font = `bold ${node.isStart ? 14 * scale : 22 * scale}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.letter, cx, cy - 1);
  if (node.code) {
    ctx.font = `${11 * scale}px monospace`;
    ctx.fillStyle = '#8fffa1';
    ctx.fillText(node.code, cx, cy + r + 12 * scale);
  }
  ctx.restore();
}

function drawConnections(ctx, cx, cy, leftX, rightX, alpha) {
  ctx.save();
  ctx.globalAlpha = 0.35 * alpha;
  ctx.strokeStyle = '#4eff6d';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(leftX + 30, cy);
  ctx.moveTo(cx + 30, cy);
  ctx.lineTo(rightX - 30, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.5 * alpha;
  ctx.fillStyle = '#8fffa1';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('·', (cx + leftX) / 2, cy - 10);
  ctx.fillText('—', (cx + rightX) / 2, cy - 10);
  ctx.restore();
}

function drawPressGlow(ctx, cx, cy) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#b6ffc4';
  ctx.beginPath();
  ctx.arc(cx, cy, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
