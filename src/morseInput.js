// Morse code input timing.
//
// The unit length is a *static* value taken from the user's settings; there
// is no dynamic adaptation. Dot/dash classification compares press duration
// against `cutoff * 3 * unit`, and silence-driven character/word completion
// uses the same cutoff against `3 * unit` and `7 * unit` respectively.

const noop = () => {};
const MIN_UNIT = 40;
const MAX_UNIT = 400;
const HISTORY_MAX_MS = 60_000;
const HISTORY_MAX_LEN = 400;

export class MorseInput {
  constructor(opts = {}) {
    this.unit = opts.unit ?? 100;
    this.cutoff = opts.cutoff ?? 0.8;
    this.onSymbol = opts.onSymbol ?? noop;
    this.onCharacterComplete = opts.onCharacterComplete ?? noop;
    this.onWordComplete = opts.onWordComplete ?? noop;
    this.onPressStart = opts.onPressStart ?? noop;
    this.onPressEnd = opts.onPressEnd ?? noop;
    this._pressStart = null;
    this._currentCode = '';
    this._charTimer = null;
    this._wordTimer = null;
    this._history = [];
    this._letterStamps = [];
    this._wordHasContent = false;
  }

  setUnit(unit) { this.unit = clamp(unit, MIN_UNIT, MAX_UNIT); }
  setCutoff(c) { this.cutoff = clamp(c, 0.3, 1.2); }

  getUnit() { return this.unit; }
  getCutoff() { return this.cutoff; }
  getCurrentCode() { return this._currentCode; }
  isPressed() { return this._pressStart !== null; }
  pressStartTime() { return this._pressStart; }
  getHistory() { return this._history; }

  dotDashMs() { return this.cutoff * 3 * this.unit; }
  charGapMs() { return this.cutoff * 3 * this.unit; }
  wordGapMs() { return this.cutoff * 7 * this.unit; }

  stampLetter(letter, time = performance.now()) {
    if (!letter) return;
    this._letterStamps.push({ time, letter });
    const cutoff = time - HISTORY_MAX_MS;
    while (this._letterStamps.length > 0 && this._letterStamps[0].time < cutoff) {
      this._letterStamps.shift();
    }
    while (this._letterStamps.length > HISTORY_MAX_LEN) this._letterStamps.shift();
  }

  getLetterStamps() { return this._letterStamps; }

  pressStart(now = performance.now()) {
    if (this._pressStart !== null) return;
    this._pressStart = now;
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    if (this._wordTimer) { clearTimeout(this._wordTimer); this._wordTimer = null; }
    this.onPressStart();
  }

  pressEnd(now = performance.now()) {
    if (this._pressStart === null) return;
    const start = this._pressStart;
    const duration = now - start;
    this._pressStart = null;
    const symbol = duration < this.dotDashMs() ? '.' : '-';
    this._currentCode += symbol;
    this._pushHistory({ start, end: now, symbol });
    this._wordHasContent = true;
    this.onSymbol(symbol, duration);
    this.onPressEnd();

    if (this._charTimer) clearTimeout(this._charTimer);
    this._charTimer = setTimeout(() => this._completeCharacter(), this.charGapMs());
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
    const remaining = Math.max(80, this.wordGapMs() - this.charGapMs());
    if (this._wordTimer) clearTimeout(this._wordTimer);
    this._wordTimer = setTimeout(() => this._completeWord(), remaining);
  }

  _completeWord() {
    this._wordTimer = null;
    if (this._wordHasContent) {
      this._wordHasContent = false;
      this.onWordComplete();
    }
  }

  flush() {
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    if (this._wordTimer) { clearTimeout(this._wordTimer); this._wordTimer = null; }
    if (this._currentCode) this._completeCharacter();
    this._completeWord();
  }

  reset() {
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    if (this._wordTimer) { clearTimeout(this._wordTimer); this._wordTimer = null; }
    this._pressStart = null;
    this._currentCode = '';
    this._history = [];
    this._letterStamps = [];
    this._wordHasContent = false;
  }
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
