// Morse code input timing: converts press/release events into dots and dashes,
// and emits a "character complete" event after enough silence.
//
// Dynamically estimates the length of one "unit" in ms based on observed input.

const noop = () => {};
const MIN_UNIT = 80;
const MAX_UNIT = 800;

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
  }

  setUnit(unit) {
    this.unit = clamp(unit, MIN_UNIT, MAX_UNIT);
    this.initialUnit = this.unit;
  }

  getUnit() { return this.unit; }
  getCurrentCode() { return this._currentCode; }
  isPressed() { return this._pressStart !== null; }

  pressStart(now = performance.now()) {
    if (this._pressStart !== null) return;
    this._pressStart = now;
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    this.onPressStart();
  }

  pressEnd(now = performance.now()) {
    if (this._pressStart === null) return;
    const duration = now - this._pressStart;
    this._pressStart = null;
    const symbol = duration < 2 * this.unit ? '.' : '-';
    const estimate = symbol === '.' ? duration : duration / 3;
    this.unit = clamp(0.85 * this.unit + 0.15 * estimate, MIN_UNIT, MAX_UNIT);
    this._currentCode += symbol;
    this.onSymbol(symbol, duration);
    this.onPressEnd();
    const gap = Math.max(this.unit * 3, 180);
    this._charTimer = setTimeout(() => this._completeCharacter(), gap);
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
  }
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
