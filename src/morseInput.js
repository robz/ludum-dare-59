// Morse code input timing: converts press/release events into dots and dashes,
// and emits a "character complete" event after enough silence.
//
// Dynamically estimates the length of one "unit" in ms based on observed input.

const noop = () => {};
const MIN_UNIT = 80;
const MAX_UNIT = 800;
const HISTORY_MAX_MS = 60_000;
const HISTORY_MAX_LEN = 400;

export class MorseInput {
  constructor(opts = {}) {
    this.unit = opts.unit ?? 200;
    this.initialUnit = this.unit;
    this.onSymbol = opts.onSymbol ?? noop;
    this.onCharacterComplete = opts.onCharacterComplete ?? noop;
    this.onPressStart = opts.onPressStart ?? noop;
    this.onPressEnd = opts.onPressEnd ?? noop;
    this._pressStart = null;
    this._currentCode = '';
    this._charTimer = null;
    this._history = []; // { start, end, symbol }
  }

  setUnit(unit) {
    this.unit = clamp(unit, MIN_UNIT, MAX_UNIT);
    this.initialUnit = this.unit;
  }

  getUnit() { return this.unit; }
  getCurrentCode() { return this._currentCode; }
  isPressed() { return this._pressStart !== null; }
  pressStartTime() { return this._pressStart; }
  getHistory() { return this._history; }

  pressStart(now = performance.now()) {
    if (this._pressStart !== null) return;
    this._pressStart = now;
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    this.onPressStart();
  }

  pressEnd(now = performance.now()) {
    if (this._pressStart === null) return;
    const start = this._pressStart;
    const duration = now - start;
    this._pressStart = null;
    const symbol = duration < 2 * this.unit ? '.' : '-';
    const estimate = symbol === '.' ? duration : duration / 3;
    this.unit = clamp(0.85 * this.unit + 0.15 * estimate, MIN_UNIT, MAX_UNIT);
    this._currentCode += symbol;
    this._pushHistory({ start, end: now, symbol });
    this.onSymbol(symbol, duration);
    this.onPressEnd();
    const gap = Math.max(this.unit * 3, 180);
    this._charTimer = setTimeout(() => this._completeCharacter(), gap);
  }

  _pushHistory(entry) {
    this._history.push(entry);
    const cutoff = entry.end - HISTORY_MAX_MS;
    while (this._history.length > 0 && this._history[0].end < cutoff) this._history.shift();
    while (this._history.length > HISTORY_MAX_LEN) this._history.shift();
  }

  _completeCharacter() {
    this._charTimer = null;
    const code = this._currentCode;
    this._currentCode = '';
    if (code.length > 0) this.onCharacterComplete(code);
  }

  flush() {
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    this._completeCharacter();
  }

  reset() {
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    this._pressStart = null;
    this._currentCode = '';
    this._history = [];
  }
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
