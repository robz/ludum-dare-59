// Morse code input timing.
//
// Dot/dash classification uses press duration vs. a cutoff-based threshold.
// Unit-length estimation is driven by the *interval between consecutive
// keydown events within a character*: those intervals are 2 units apart
// when the preceding press was a dot, and 4 units apart when it was a dash.
//
// After silence ≥ cutoff * 3 * unit a character is emitted; after silence
// ≥ cutoff * 7 * unit a whole-word transmission is emitted.

const noop = () => {};
const MIN_UNIT = 40;
const MAX_UNIT = 800;
const HISTORY_MAX_MS = 60_000;
const HISTORY_MAX_LEN = 400;

export class MorseInput {
  constructor(opts = {}) {
    this.unit = opts.unit ?? 100;
    this.cutoff = opts.cutoff ?? 0.8;
    this.initialUnit = this.unit;
    this.onSymbol = opts.onSymbol ?? noop;
    this.onCharacterComplete = opts.onCharacterComplete ?? noop;
    this.onWordComplete = opts.onWordComplete ?? noop;
    this.onPressStart = opts.onPressStart ?? noop;
    this.onPressEnd = opts.onPressEnd ?? noop;
    this._pressStart = null;
    this._lastKeyDown = null;
    this._currentCode = '';
    this._charTimer = null;
    this._wordTimer = null;
    this._history = [];
    this._letterStamps = [];
    this._wordHasContent = false;
  }

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

  setUnit(unit) {
    this.unit = clamp(unit, MIN_UNIT, MAX_UNIT);
    this.initialUnit = this.unit;
  }
  setCutoff(c) { this.cutoff = clamp(c, 0.3, 1.2); }

  getUnit() { return this.unit; }
  getCutoff() { return this.cutoff; }
  getCurrentCode() { return this._currentCode; }
  isPressed() { return this._pressStart !== null; }
  pressStartTime() { return this._pressStart; }
  getHistory() { return this._history; }

  // Duration threshold between dot and dash (ms).
  dotDashMs() { return this.cutoff * 3 * this.unit; }
  // Silence threshold between intra-character gap and character gap (ms).
  charGapMs() { return this.cutoff * 3 * this.unit; }
  // Silence threshold between character gap and word gap (ms).
  wordGapMs() { return this.cutoff * 7 * this.unit; }

  pressStart(now = performance.now()) {
    if (this._pressStart !== null) return;

    // Update unit estimate from keydown interval (within current character).
    // The interval is halved before being fed to the filter — earlier
    // versions were pushing the unit upward roughly twice as fast as they
    // should, so we correct for that here.
    if (this._lastKeyDown !== null && this._currentCode.length > 0) {
      const interval = (now - this._lastKeyDown) / 2;
      const lastSym = this._currentCode[this._currentCode.length - 1];
      const expected = lastSym === '-' ? 4 : 2; // units between consecutive downs
      const estimate = interval / expected;
      if (estimate > MIN_UNIT * 0.5 && estimate < MAX_UNIT * 1.5) {
        this.unit = clamp(0.6 * this.unit + 0.4 * estimate, MIN_UNIT, MAX_UNIT);
      }
    }

    this._pressStart = now;
    this._lastKeyDown = now;
    if (this._charTimer) { clearTimeout(this._charTimer); this._charTimer = null; }
    if (this._wordTimer) { clearTimeout(this._wordTimer); this._wordTimer = null; }
    this.onPressStart();
  }

  pressEnd(now = performance.now()) {
    if (this._pressStart === null) return;
    const start = this._pressStart;
    const duration = now - start;
    this._pressStart = null;
    const threshold = this.dotDashMs();
    const symbol = duration < threshold ? '.' : '-';
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
    this._lastKeyDown = null;
    if (code.length > 0) this.onCharacterComplete(code);
    // Schedule word completion after the remaining silence to reach word gap.
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
    this._lastKeyDown = null;
    this._currentCode = '';
    this._history = [];
    this._letterStamps = [];
    this._wordHasContent = false;
  }
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
