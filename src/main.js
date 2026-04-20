// Morse Defense — main entry point.
//
// Scenes:   'title' | 'play' | 'dead'
// Overlays: help | settings | promotion
//
// Exports draw(options) so snapshot.js can render any scene headlessly.

import { CodeInputTree } from './codeInputTree.js';
import { CodeInputSliding } from './codeInputSliding.js';
import { AttackView } from './attackView.js';
import { MorseInput } from './morseInput.js';
import { SettingsOverlay, loadSettings, saveSettings, DEFAULTS } from './settings.js';
import { loadProgress, saveProgress, recordScore } from './progress.js';
import { drawHelp, EXPLAINER_COUNT } from './help.js';
import { drawLeaderboard } from './leaderboard.js';
import { drawTape } from './tape.js';
import { LEVELS, getLevel, levelCount } from './levels.js';
import { ALL_LETTERS, LETTER_TO_CODE, parentLetter, codeToLetter } from './morse.js';
import { RANKS, rankFor, drawInsignia } from './ranks.js';
import {
  resumeAudio, setVolume,
  startMorseTone, stopMorseTone,
  playFire, playExplosion, playDamage, playError, playTransmit,
} from './sound.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const inBrowser = typeof requestAnimationFrame !== 'undefined';
const isTouch = inBrowser && ('ontouchstart' in window || (navigator?.maxTouchPoints > 0));

const state = makeInitialState();

function makeInitialState() {
  const settings = loadSettings();
  const progress = loadProgress();
  const codeInput = makeCodeInput(settings.interface);
  const attackView = new AttackView({ enemySpeed: LEVELS[0].enemySpeed });
  const morseInput = new MorseInput({
    unit: settings.unitMs,
    cutoff: settings.cutoff,
    onSymbol,
    onCharacterComplete,
    onWordComplete,
    onPressStart: () => { if (state.scene === 'play' && !state.paused) startMorseTone(); },
    onPressEnd: () => stopMorseTone(),
  });
  const settingsOverlay = new SettingsOverlay(settings);
  setVolume(settings.volume);

  return {
    scene: 'title',
    overlay: null,
    paused: false,
    level: 1,
    levelElapsed: 0,
    gameElapsed: 0,
    spawnCountdown: 0,
    health: settings.maxHits,
    charsSent: 0,
    enemiesDestroyed: 0,
    levelReached: 1,
    destroyCount: new Map(),
    killedLetters: new Set(),
    seenLetters: new Set(),
    introducedLetters: new Set(),
    spawnCount: new Map(),
    letterTooltip: null,
    scoreBubbles: [],
    wordBuffer: [],
    invalidBanner: null,
    titleLevelPick: Math.max(1, Math.min(levelCount(), progress.lastLevel || 1)),
    explainerIndex: 0,
    promotion: null, // { targetLevel, stage: 'intrusive' | 'notif' | 'hint' }
    codeInput, attackView, morseInput, settingsOverlay,
    settings, progress,
    lastFrameTime: null,
    lastRun: null,
  };
}

function makeCodeInput(kind) {
  return kind === 'sliding' ? new CodeInputSliding() : new CodeInputTree();
}

function setTitleLevelPick(n) {
  const clamped = Math.max(1, Math.min(levelCount(), n | 0));
  state.titleLevelPick = clamped;
  if (state.progress.lastLevel !== clamped) {
    state.progress.lastLevel = clamped;
    saveProgress(state.progress);
  }
}

function swapCodeInterface(kind) {
  const oldUsed = state.codeInput.getUsedLetters();
  state.codeInput = makeCodeInput(kind);
  for (const l of oldUsed) state.codeInput.markUsed(l);
}

// ---------- morse input callbacks ----------

function onSymbol(symbol) {
  if (state.scene !== 'play' || state.paused) return;
  state.codeInput.advance(symbol);
}

function onCharacterComplete(code) {
  if (state.scene !== 'play' || state.paused) {
    state.wordBuffer = [];
    state.codeInput.reset();
    state.attackView.setPartialWord('');
    return;
  }
  const letter = codeToLetter(code);
  if (!letter) {
    state.codeInput.resetFlash('?', false);
    playError();
    return;
  }
  state.charsSent += 1;
  state.wordBuffer.push(letter);
  state.morseInput.stampLetter(letter);
  state.codeInput.resetFlash(letter, true);
  playTransmit();
  state.attackView.setPartialWord(state.wordBuffer.join(''));
  // Dismiss the new-letter tooltip as soon as the player successfully inputs
  // the letter it was showing.
  if (state.letterTooltip && state.letterTooltip.letter === letter) {
    state.letterTooltip = null;
  }
}

function onWordComplete() {
  if (state.scene !== 'play' || state.paused) {
    state.wordBuffer = [];
    state.attackView.setPartialWord('');
    return;
  }
  const word = state.wordBuffer.join('');
  state.wordBuffer = [];
  state.attackView.setPartialWord('');
  if (word.length === 0) return;
  const result = state.attackView.fire(word);
  if (result.hit) {
    playFire();
    for (const L of word) state.codeInput.markUsed(L);
    state.killedLetters.add(word);
    for (const L of word) state.killedLetters.add(L);
  } else {
    playError();
  }
}

// ---------- game control ----------

function startGame(fromLevel = 1) {
  state.scene = 'play';
  state.paused = false;
  state.level = fromLevel;
  state.levelReached = Math.max(state.levelReached, fromLevel);
  state.levelElapsed = 0;
  state.gameElapsed = 0;
  state.spawnCountdown = 1.0;
  state.health = state.settings.maxHits;
  state.charsSent = 0;
  state.enemiesDestroyed = 0;
  state.destroyCount = new Map();
  state.killedLetters = new Set();
  state.seenLetters = new Set();
  state.introducedLetters = new Set();
  state.spawnCount = new Map();
  // Starting mid-game means the player has implicitly "seen" the alphabet
  // already — suppress tooltips and enable full word variety immediately.
  if (fromLevel > 1) {
    for (const L of ALL_LETTERS) {
      state.seenLetters.add(L);
      state.introducedLetters.add(L);
    }
  }
  state.letterTooltip = null;
  state.scoreBubbles = [];
  state.wordBuffer = [];
  state.codeInput = makeCodeInput(state.settings.interface);
  state.attackView = new AttackView({ enemySpeed: getLevel(fromLevel).enemySpeed });
  state.morseInput.setUnit(state.settings.unitMs);
  state.morseInput.setCutoff(state.settings.cutoff);
  state.morseInput.reset();
  state.invalidBanner = null;
  state.promotion = null;
}

function triggerPromotion() {
  if (state.promotion) return; // already pending
  if (state.level >= levelCount()) {
    state.levelElapsed = 0; // loop
    return;
  }
  const seen = state.progress.seenPromotionModal === true;
  state.promotion = {
    targetLevel: state.level + 1,
    stage: seen ? 'notif' : 'intrusive',
  };
  if (!seen) state.paused = true;
}

function acceptPromotion() {
  if (!state.promotion) return;
  const target = state.promotion.targetLevel;
  state.progress.seenPromotionModal = true;
  state.progress.maxLevel = Math.max(state.progress.maxLevel || 1, target);
  saveProgress(state.progress);
  state.promotion = null;
  state.paused = false;
  state.level = target;
  state.levelReached = Math.max(state.levelReached, target);
  state.levelElapsed = 0;
  state.spawnCountdown = 1.0;
  state.attackView.setEnemySpeed(getLevel(target).enemySpeed);
}

function declinePromotion() {
  if (!state.promotion) return;
  state.progress.seenPromotionModal = true;
  saveProgress(state.progress);
  state.promotion.stage = 'hint';
  state.paused = false;
}

function die() {
  const destroyed = state.enemiesDestroyed;
  const cpm = state.gameElapsed > 0 ? (state.charsSent * 60) / state.gameElapsed : 0;
  const score = currentScore();
  const newHigh = score > (state.progress.highScore || 0);
  if (newHigh) state.progress.highScore = score;
  state.progress.maxLevel = Math.max(state.progress.maxLevel || 1, state.levelReached);
  const ranking = recordScore(state.progress, score);
  saveProgress(state.progress);
  state.lastRun = {
    destroyed,
    charsSent: state.charsSent,
    survivedSec: state.gameElapsed,
    cpm,
    score,
    levelReached: state.levelReached,
    highScore: state.progress.highScore || 0,
    newHighScore: newHigh,
    rank: ranking.rank,
    total: ranking.total,
  };
  state.scene = 'dead';
  state.overlay = null;
  state.paused = false;
  state.promotion = null;
  state.morseInput.reset();
  stopMorseTone();
}

function togglePause() {
  if (state.scene !== 'play') return;
  if (state.promotion && state.promotion.stage === 'intrusive') return;
  state.paused = !state.paused;
  if (state.paused) {
    state.morseInput.reset();
    stopMorseTone();
  }
}

// ---------- spawning ----------

function letterAllowed(l) {
  const code = LETTER_TO_CODE[l];
  const depth = code.length;
  const p = parentLetter(l);
  const counts = state.destroyCount;
  if (p === null) return true;
  if ((counts.get(p) || 0) < 2) return false;
  const peerDepth = depth - 1;
  for (const peer of ALL_LETTERS) {
    if (LETTER_TO_CODE[peer].length !== peerDepth) continue;
    if ((counts.get(peer) || 0) < 1) return false;
  }
  return true;
}

function letterWeight(letter) {
  // Heavily favor letters the player hasn't been shown yet so variety comes
  // in fast at the start of each level; otherwise taper weight as the letter
  // is spawned more often.
  if (!state.introducedLetters.has(letter)) return 12;
  const spawned = state.spawnCount.get(letter) || 0;
  return 1 / (1 + spawned);
}

function weightedPick(items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return items[items.length - 1];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickAvailableLetter() {
  const pool = ALL_LETTERS.filter(letterAllowed);
  if (pool.length === 0) return 'E';
  const weights = pool.map(letterWeight);
  return weightedPick(pool, weights);
}

function wordWeight(word) {
  // Rare words + words containing rarely-seen letters score highest.
  const spawned = state.spawnCount.get(word) || 0;
  const rarityBonus = [...word].reduce((acc, c) => {
    const s = state.spawnCount.get(c) || 0;
    return acc + 1 / (1 + s);
  }, 0) / word.length;
  return (1 / (1 + spawned)) * (0.5 + rarityBonus);
}

function pickFromWords(words) {
  if (!words || words.length === 0) return null;
  const weights = words.map(wordWeight);
  return weightedPick(words, weights);
}

function pickSpawnText() {
  const cfg = getLevel(state.level);
  let candidate;
  if (cfg.mode === 'letters') {
    candidate = pickAvailableLetter();
  } else {
    const words = cfg.words || [];
    if (cfg.mode === 'mixed') {
      candidate = (Math.random() < 0.4 || words.length === 0)
        ? pickAvailableLetter()
        : (pickFromWords(words) ?? pickAvailableLetter());
    } else {
      candidate = words.length === 0
        ? pickAvailableLetter()
        : (pickFromWords(words) ?? pickAvailableLetter());
    }
  }
  // Word gating: only spawn a multi-letter word if every letter has been seen.
  if (candidate.length > 1) {
    const unseen = [...candidate].filter(c => !state.seenLetters.has(c));
    if (unseen.length > 0) {
      candidate = unseen[Math.floor(Math.random() * unseen.length)];
    }
  }
  // Record seen letters + spawn-count (both the whole text and each letter).
  for (const c of candidate) state.seenLetters.add(c);
  state.spawnCount.set(candidate, (state.spawnCount.get(candidate) || 0) + 1);
  for (const c of candidate) {
    if (c !== candidate) state.spawnCount.set(c, (state.spawnCount.get(c) || 0) + 1);
  }
  return candidate;
}

// ---------- update ----------

function updatePlay(dt) {
  // During an intrusive promotion modal the game is paused; do nothing.
  if (state.promotion && state.promotion.stage === 'intrusive') return;

  state.levelElapsed += dt;
  state.gameElapsed += dt;
  const cfg = getLevel(state.level);

  state.spawnCountdown -= dt;
  const active = state.attackView.activeCount();
  const canSpawn = !state.promotion || state.promotion.stage !== 'intrusive';
  if (canSpawn && state.spawnCountdown <= 0 && active < cfg.maxActive) {
    const text = pickSpawnText();
    state.attackView.spawn(text, { speedScale: speedScaleForWord(text) });
    if (text.length === 1 && !state.introducedLetters.has(text)) {
      state.introducedLetters.add(text);
      state.letterTooltip = { letter: text, code: LETTER_TO_CODE[text] };
    }
    const [mn, mx] = spawnIntervalForLevel(state.level);
    state.spawnCountdown = mn + Math.random() * (mx - mn);
  }

  const r = state.attackView.update(dt);
  if (r.damageTaken > 0) {
    state.health -= r.damageTaken;
    playDamage();
    if (state.health <= 0) die();
  }
  if (r.destroyed > 0) {
    state.enemiesDestroyed += r.destroyed;
    playExplosion();
    if (r.destroyedTexts) {
      for (const txt of r.destroyedTexts) {
        if (txt.length === 1) {
          state.destroyCount.set(txt, (state.destroyCount.get(txt) || 0) + 1);
        }
      }
    }
    if (r.destroyedEvents) {
      for (const ev of r.destroyedEvents) spawnScoreBubble(ev);
    }
  }

  // Advance + prune score bubbles
  for (const b of state.scoreBubbles) b.t += dt;
  state.scoreBubbles = state.scoreBubbles.filter(b => b.t < b.lifetime);

  state.codeInput.update(dt);

  if (state.invalidBanner && performance.now() > state.invalidBanner.until) {
    state.invalidBanner = null;
  }

  // Level advance → promotion trigger. We used to also wait for the radar
  // to be clear, but spawning now continues past the timer, so that would
  // keep the trigger from ever firing. Fire it purely on the elapsed clock.
  if (!state.promotion && state.levelElapsed >= cfg.duration) {
    triggerPromotion();
  }
}

function spawnScoreBubble(event) {
  // Bubble appears at the radar-space location of the scoring event (enemy
  // death) and floats upward as it fades.
  const text = typeof event === 'string' ? event : event.text;
  const pts = pointsFor(text);
  state.scoreBubbles.push({
    text: `+${pts}`,
    nx: event?.nx ?? 0,
    ny: event?.ny ?? 0,
    t: 0,
    lifetime: 1.4,
  });
}

function pointsFor(text) {
  // Match the v3 scoring: longer words yield more points (10 per character).
  return (text || '').length * 10;
}

function currentScore() {
  return state.enemiesDestroyed * 100 + state.level * 50;
}

// Target spawn rate in characters per minute for a level.
function targetCpmForLevel(level) {
  const L1 = 30, L9 = 150;
  const n = levelCount();
  return L1 + (L9 - L1) * ((level - 1) / Math.max(1, n - 1));
}

function avgWordLengthForLevel(level) {
  const cfg = getLevel(level);
  if (cfg.mode === 'letters' || !cfg.words || cfg.words.length === 0) return 1;
  const sum = cfg.words.reduce((s, w) => s + w.length, 0);
  const wordAvg = sum / cfg.words.length;
  if (cfg.mode === 'mixed') return 0.4 * 1 + 0.6 * wordAvg;
  return wordAvg;
}

function spawnIntervalForLevel(level) {
  const cpm = targetCpmForLevel(level);
  const avg = avgWordLengthForLevel(level);
  const base = Math.max(1.2, 60 * avg / cpm);
  return [base * 0.8, base * 1.2];
}

// Per-enemy speed multiplier: longer words approach slower.
function speedScaleForWord(text) {
  const n = Math.max(1, (text || '').length);
  return 1 / n;
}

function textScale() {
  const v = state.settings?.textScale;
  return typeof v === 'number' && isFinite(v) ? v : 1;
}

function fs(basePx) {
  return Math.max(1, Math.round(basePx * textScale()));
}

function applySettingChange(key) {
  if (!key) return;
  if (key === 'volume' || key === 'reset') setVolume(state.settings.volume);
  if (key === 'unitMs' || key === 'reset') state.morseInput.setUnit(state.settings.unitMs);
  if (key === 'cutoff' || key === 'reset') state.morseInput.setCutoff(state.settings.cutoff);
  if (key === 'interface' || key === 'reset') swapCodeInterface(state.settings.interface);
  if (key === 'maxHits' || key === 'reset') {
    if (state.scene !== 'play') state.health = state.settings.maxHits;
    else if (state.health > state.settings.maxHits) state.health = state.settings.maxHits;
  }
}

function setOverlay(next) {
  if (state.overlay === next) return;
  state.overlay = next;
  if (next) {
    state.morseInput.reset();
    state.wordBuffer = [];
    state.attackView.setPartialWord('');
    stopMorseTone();
  }
}

// ---------- input ----------

const HOTKEYS = new Set([' ', 'h', 'H', 's', 'S', 'p', 'P', 'q', 'Q', 'Escape', 'Enter',
                          'Backspace', 'Delete',
                          'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
for (let i = 1; i <= 9; i++) HOTKEYS.add(String(i));

function handleKeyDown(e) {
  // Don't consume browser/OS shortcut chords — let Cmd-R, Ctrl-T, Alt-Tab,
  // etc. fall through untouched.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  resumeAudio();

  // Promotion dialog input — takes priority over everything else.
  if (state.promotion) {
    if (state.promotion.stage === 'intrusive') {
      if (e.key === 'Enter' || e.key === ' ') { acceptPromotion(); e.preventDefault(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { declinePromotion(); e.preventDefault(); return; }
      if (e.key === 'Escape') { declinePromotion(); e.preventDefault(); return; }
      e.preventDefault();
      return;
    }
    // notif/hint: Enter accepts, Backspace/Delete dismisses to hint.
    if (e.key === 'Enter') { acceptPromotion(); e.preventDefault(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      state.promotion.stage = 'hint';
      e.preventDefault();
      return;
    }
  }

  if (e.key === 'h' || e.key === 'H') {
    // Help modal available everywhere except dead screen.
    if (state.scene !== 'dead') setOverlay(state.overlay === 'help' ? null : 'help');
    e.preventDefault();
    return;
  }
  if (e.key === 's' || e.key === 'S') {
    if (state.scene !== 'dead') setOverlay(state.overlay === 'settings' ? null : 'settings');
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') {
    setOverlay(null);
    e.preventDefault();
    return;
  }
  if (e.key === 'p' || e.key === 'P') {
    if (state.scene === 'play' && !state.overlay) togglePause();
    e.preventDefault();
    return;
  }

  if (state.overlay === 'help') {
    if (e.key === 'ArrowLeft') {
      state.explainerIndex = (state.explainerIndex - 1 + EXPLAINER_COUNT) % EXPLAINER_COUNT;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      state.explainerIndex = (state.explainerIndex + 1) % EXPLAINER_COUNT;
      e.preventDefault();
    }
    return;
  }

  if (state.overlay === 'settings') {
    const res = state.settingsOverlay.handleKey(e.key);
    if (res.changed) applySettingChange(res.changed);
    e.preventDefault();
    return;
  }

  if (state.scene === 'title') {
    if (e.key === 'Enter' || e.key === ' ') {
      startGame(state.titleLevelPick);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      setTitleLevelPick(state.titleLevelPick - 1);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      const cap = Math.min(state.progress.maxLevel || 1, levelCount());
      setTitleLevelPick(Math.min(cap, state.titleLevelPick + 1));
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      setTitleLevelPick(parseInt(e.key, 10));
      e.preventDefault();
      return;
    }
    return;
  }

  if (state.scene === 'dead') {
    // Space no longer dismisses — only Enter (or the Continue button).
    if (e.key === 'Enter') {
      state.scene = 'title';
    }
    e.preventDefault();
    return;
  }

  // Playing
  if (state.paused) {
    if (e.key === ' ') { togglePause(); e.preventDefault(); return; }
    return;
  }
  if (e.key === ' ') {
    if (!e.repeat) state.morseInput.pressStart();
    e.preventDefault();
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= levelCount()) {
      state.level = n;
      state.levelReached = Math.max(state.levelReached, n);
      state.levelElapsed = 0;
      state.destroyCount = new Map();
      state.killedLetters = new Set();
      state.seenLetters = new Set();
      state.spawnCount = new Map();
      state.attackView = new AttackView({ enemySpeed: getLevel(n).enemySpeed });
      state.spawnCountdown = 0.3;
    }
    e.preventDefault();
    return;
  }
  if (e.key === 'q' || e.key === 'Q') {
    // Debug: force a promotion to appear.
    if (!state.promotion) triggerPromotion();
    e.preventDefault();
    return;
  }
  if (!HOTKEYS.has(e.key)) {
    state.invalidBanner = {
      msg: isTouch ? 'Tap to signal' : 'Spacebar to signal',
      until: performance.now() + 1600,
    };
    playError();
  }
}

function handleKeyUp(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (state.scene !== 'play' || state.paused) return;
  if (e.key === ' ') {
    state.morseInput.pressEnd();
    e.preventDefault();
  }
}

function handlePointerDown(e) {
  resumeAudio();
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);

  // Promotion UI takes priority
  if (state.promotion) {
    if (state.promotion.stage === 'intrusive') {
      const buttons = promotionModalButtons(canvas.width, canvas.height);
      if (pointInRect(px, py, buttons.accept)) { acceptPromotion(); return; }
      if (pointInRect(px, py, buttons.decline)) { declinePromotion(); return; }
      return;
    }
    if (state.promotion.stage === 'notif') {
      const r = promotionNotifRect(canvas.width, canvas.height);
      if (pointInRect(px, py, r)) { acceptPromotion(); return; }
    } else if (state.promotion.stage === 'hint') {
      const r = promotionHintRect(canvas.width, canvas.height);
      if (pointInRect(px, py, r)) { acceptPromotion(); return; }
    }
  }

  // HUD buttons (help, settings, pause)
  const hRect = helpButtonRect(canvas.width);
  const sRect = settingsButtonRect(canvas.width);
  const pRect = pauseButtonRect(canvas.width);
  if (state.scene !== 'dead') {
    if (pointInRect(px, py, hRect)) {
      setOverlay(state.overlay === 'help' ? null : 'help');
      return;
    }
    if (pointInRect(px, py, sRect)) {
      setOverlay(state.overlay === 'settings' ? null : 'settings');
      return;
    }
  }
  if (state.scene === 'play' && !state.overlay && !state.promotion && pointInRect(px, py, pRect)) {
    togglePause();
    return;
  }

  // Level arrow hit tests on title screen
  if (state.scene === 'title' && !state.overlay) {
    const arrows = titleArrowRects(canvas.width, canvas.height);
    if (pointInRect(px, py, arrows.left)) {
      setTitleLevelPick(state.titleLevelPick - 1);
      return;
    }
    if (pointInRect(px, py, arrows.right)) {
      const cap = Math.min(state.progress.maxLevel || 1, levelCount());
      setTitleLevelPick(Math.min(cap, state.titleLevelPick + 1));
      return;
    }
  }

  if (state.overlay) {
    if (state.overlay === 'help') {
      // Click on help modal cycles to next variant.
      state.explainerIndex = (state.explainerIndex + 1) % EXPLAINER_COUNT;
      return;
    }
    if (state.overlay === 'settings') {
      const res = state.settingsOverlay.handlePointer(px, py, { x: 0, y: 0, w: canvas.width, h: canvas.height });
      if (res === null) {
        // Outside the modal — dismiss.
        setOverlay(null);
      } else if (res.changed) {
        applySettingChange(res.changed);
      }
      return;
    }
    setOverlay(null);
    return;
  }
  if (state.scene === 'title') { startGame(state.titleLevelPick); return; }
  if (state.scene === 'dead') {
    // Only allow dismissal via the explicit Continue button.
    const r = continueButtonRect(canvas.width, canvas.height);
    if (pointInRect(px, py, r)) state.scene = 'title';
    return;
  }
  if (state.scene === 'play') {
    if (state.paused) { togglePause(); return; }
    state.morseInput.pressStart();
  }
}

function handlePointerUp() {
  if (state.scene !== 'play' || state.paused) return;
  state.morseInput.pressEnd();
}

// ---------- rendering ----------

export function draw(options = {}) {
  applyOverrides(options);

  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#061007';
  ctx.fillRect(0, 0, W, H);

  if (state.scene === 'title') {
    drawTitle(W, H);
  } else {
    const landscape = W >= H;
    const layout = computeLayout(W, H, landscape);
    state.attackView.draw(ctx, layout.radar, { now: performance.now() });
    drawTape(ctx, layout.tape, state.morseInput, {
      now: performance.now(),
      referenceUnit: state.settings.unitMs,
    });
    state.codeInput.draw(ctx, layout.code, {
      isPressed: state.morseInput.isPressed(),
      pressStartTime: state.morseInput.pressStartTime(),
      unit: state.morseInput.getUnit(),
      cutoff: state.morseInput.getCutoff(),
      now: performance.now(),
      orientation: landscape ? 'landscape' : 'portrait',
    });
    drawHud(W, H, layout);
    drawScoreBubbles(W, H, layout);
    if (state.letterTooltip) drawLetterTooltip(W, H, layout);
    if (state.paused && !(state.promotion && state.promotion.stage === 'intrusive')) {
      drawPausedOverlay(layout.radar);
    }
    // Promotion drawn on top of game but below help/settings overlays.
    if (state.promotion) drawPromotion(W, H, layout);
  }

  if (state.scene === 'dead' && state.lastRun) {
    drawLeaderboard(ctx, { x: 0, y: 0, w: W, h: H }, state.lastRun);
    drawButton(continueButtonRect(W, H), 'Continue  ↵', false);
  }

  if (state.overlay === 'help') {
    drawHelp(ctx, { x: 0, y: 0, w: W, h: H }, {
      usedLetters: state.codeInput.getUsedLetters(),
      explainer: state.explainerIndex,
      isTouch,
      unitMs: state.settings.unitMs,
    });
  } else if (state.overlay === 'settings') {
    state.settingsOverlay.draw(ctx, { x: 0, y: 0, w: W, h: H });
  }

  if (state.invalidBanner) drawBanner(W, H, state.invalidBanner.msg);
}

function computeLayout(W, H, landscape) {
  const tapeH = Math.max(62, Math.min(96, Math.round(H * 0.1)));
  if (landscape) {
    const codeW = Math.min(480, Math.max(280, Math.round(W * 0.32)));
    return {
      code: { x: 0, y: 0, w: codeW, h: H },
      radar: { x: codeW, y: 0, w: W - codeW, h: H - tapeH },
      tape: { x: codeW, y: H - tapeH, w: W - codeW, h: tapeH },
    };
  }
  const codeH = Math.min(Math.round(H * 0.4), Math.max(220, Math.round(H * 0.34)));
  const radarH = H - codeH - tapeH;
  return {
    code: { x: 0, y: H - codeH, w: W, h: codeH },
    radar: { x: 0, y: 0, w: W, h: radarH },
    tape: { x: 0, y: radarH, w: W, h: tapeH },
  };
}

function applyOverrides(options) {
  if (options.scene) state.scene = options.scene;
  if (options.overlay !== undefined) state.overlay = options.overlay;
  if (options.explainerIndex !== undefined) state.explainerIndex = options.explainerIndex;
  if (options.paused !== undefined) state.paused = options.paused;
  if (options.interface) {
    state.settings.interface = options.interface;
    swapCodeInterface(options.interface);
  }
  if (options.level) {
    state.level = options.level;
    state.levelReached = Math.max(state.levelReached, options.level);
  }
  if (options.spawnEnemies) {
    for (const text of options.spawnEnemies) state.attackView.spawn(text);
  }
  if (options.ticks) {
    for (let i = 0; i < options.ticks; i++) state.attackView.update(0.05, performance.now());
  }
  if (options.health !== undefined) state.health = options.health;
  if (options.destroyed !== undefined) state.enemiesDestroyed = options.destroyed;
  if (options.killedLetters) {
    state.killedLetters = new Set(options.killedLetters);
    for (const l of options.killedLetters) state.codeInput.markUsed(l);
  }
  if (options.destroyCounts) {
    state.destroyCount = new Map(Object.entries(options.destroyCounts));
  }
  if (options.currentCode) {
    for (const c of options.currentCode) state.codeInput.advance(c);
    if (state.codeInput.animElapsed !== undefined) state.codeInput.animElapsed = 999;
  }
  if (options.pressedForMs !== undefined) {
    state.morseInput._pressStart = performance.now() - options.pressedForMs;
  }
  if (options.wordBuffer) {
    state.wordBuffer = [...options.wordBuffer];
    state.attackView.setPartialWord(state.wordBuffer.join(''));
  }
  if (options.promotion) {
    state.promotion = { ...options.promotion };
    if (state.promotion.stage === 'intrusive') state.paused = true;
  }
  if (options.invalidBanner) {
    state.invalidBanner = { msg: options.invalidBanner, until: performance.now() + 5000 };
  }
  if (options.lastRun) state.lastRun = options.lastRun;
  if (options.press) {
    const now = performance.now();
    const unit = state.morseInput.getUnit();
    const history = [];
    let t = 0;
    for (const p of options.press) {
      t += (p.gapUnits || 0) * unit;
      const duration = p.sym === '-' ? unit * 3 : unit;
      history.push({ start: t, end: t + duration, symbol: p.sym });
      t += duration;
    }
    if (history.length > 0) {
      const shift = now - 80 - history[history.length - 1].end;
      for (const h of history) { h.start += shift; h.end += shift; }
    }
    state.morseInput._history = history;
  }
  if (options.letterStamps) {
    const now = performance.now();
    const unit = state.morseInput.getUnit();
    state.morseInput._letterStamps = options.letterStamps.map((l, i) => ({
      time: now - (options.letterStamps.length - i) * unit * 10,
      letter: l,
    }));
  }
  if (options.tooltipLetter) {
    const L = options.tooltipLetter.toUpperCase();
    state.letterTooltip = {
      letter: L,
      code: LETTER_TO_CODE[L] || '',
      until: performance.now() + 4000,
    };
  }
  if (options.scoreBubbles) {
    state.scoreBubbles = options.scoreBubbles.map((text, i) => ({
      text,
      nx: -0.4 + i * 0.4,
      ny: -0.3 + i * 0.15,
      t: 0,
      lifetime: 1.4,
    }));
  }
}

function drawTitle(W, H) {
  const cx = W / 2;
  const landscape = W >= H;
  const titleY = H * (landscape ? 0.3 : 0.22);

  ctx.save();
  const rad = Math.min(W, H) * 0.28;
  const gr = ctx.createRadialGradient(cx, titleY + rad * 0.05, 0, cx, titleY + rad * 0.05, rad);
  gr.addColorStop(0, 'rgba(40, 120, 60, 0.4)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(cx, titleY + rad * 0.05, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.22)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, titleY + rad * 0.05, rad * (i / 4), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#b6ffc4';
  ctx.font = `bold ${Math.round(Math.min(W, H) * (landscape ? 0.09 : 0.075))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MORSE DEFENSE', cx, titleY);

  ctx.fillStyle = '#eaffe1';
  ctx.font = `${Math.round(Math.min(W, H) * 0.03)}px monospace`;
  ctx.fillText(
    isTouch ? 'Tap to shoot an enemy' : 'Press SPACE or click to shoot an enemy',
    cx, titleY + Math.round(Math.min(W, H) * 0.08)
  );
  ctx.fillStyle = 'rgba(180, 255, 200, 0.8)';
  ctx.font = `${Math.round(Math.min(W, H) * 0.022)}px monospace`;
  ctx.fillText(
    isTouch ? 'Tap briefly for dots and longer for dashes' : 'Tap briefly for dots and longer for dashes',
    cx, titleY + Math.round(Math.min(W, H) * 0.12)
  );

  // Level select area
  const selY = H * 0.7;
  const cap = Math.min(state.progress.maxLevel || 1, levelCount());
  const cfg = getLevel(state.titleLevelPick);
  const rank = rankFor(state.titleLevelPick);
  const arrows = titleArrowRects(W, H);

  // Arrow glyphs (drawn inside the arrow rects)
  drawArrow(arrows.left, '◂', state.titleLevelPick > 1);
  drawArrow(arrows.right, '▸', state.titleLevelPick < cap);

  ctx.fillStyle = '#eaffe1';
  ctx.font = `${Math.round(Math.min(W, H) * 0.03)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LEVEL ${state.titleLevelPick} / ${levelCount()}`, cx, selY);

  // Rank + insignia
  const insigSize = Math.round(Math.min(W, H) * 0.06);
  const rankY = selY + Math.round(Math.min(W, H) * 0.04);
  drawInsignia(ctx, cx - 80, rankY, insigSize, state.titleLevelPick);
  ctx.fillStyle = '#b6ffc4';
  ctx.font = `bold ${Math.round(Math.min(W, H) * 0.026)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, cx - 40, rankY);

  if (state.titleLevelPick > cap) {
    ctx.fillStyle = '#ff9a9a';
    ctx.font = `${Math.round(Math.min(W, H) * 0.018)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('(not yet unlocked — debug)', cx, rankY + insigSize);
  }

  ctx.fillStyle = 'rgba(160, 220, 180, 0.65)';
  ctx.font = `${Math.round(Math.min(W, H) * 0.018)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H help · S settings · ←/→ level', cx, H * 0.92);

  drawButton(helpButtonRect(W), 'Help', state.overlay === 'help');
  drawButton(settingsButtonRect(W), 'Settings', state.overlay === 'settings');
}

function drawArrow(rect, glyph, enabled) {
  ctx.save();
  ctx.fillStyle = enabled ? 'rgba(10, 28, 15, 0.85)' : 'rgba(10, 28, 15, 0.45)';
  ctx.strokeStyle = enabled ? '#4eff6d' : 'rgba(80, 160, 110, 0.5)';
  ctx.lineWidth = 1.3;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = enabled ? '#eaffe1' : 'rgba(160, 220, 180, 0.5)';
  ctx.font = `bold ${Math.round(rect.h * 0.7)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

function titleArrowRects(W, H) {
  const cx = W / 2;
  const selY = H * 0.7;
  const arrowW = 52;
  const arrowH = 44;
  return {
    left:  { x: cx - 180, y: selY - arrowH / 2, w: arrowW, h: arrowH },
    right: { x: cx + 128, y: selY - arrowH / 2, w: arrowW, h: arrowH },
  };
}

function drawHud(W, H, layout) {
  const cfg = getLevel(state.level);
  const rank = rankFor(state.level);
  const sc = textScale();

  ctx.fillStyle = '#b6ffc4';
  ctx.font = `${fs(14)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const hudX = layout.radar.x + Math.round(12 * sc);
  const insigSize = Math.round(26 * sc);
  const hudTopY = Math.round(8 * sc);
  drawInsignia(ctx, hudX + insigSize / 2, hudTopY + insigSize / 2, insigSize, state.level);
  ctx.fillStyle = '#b6ffc4';
  ctx.font = `bold ${fs(14)}px monospace`;
  ctx.fillText(`LV ${state.level} — ${rank}`, hudX + insigSize + Math.round(10 * sc), hudTopY);
  ctx.font = `${fs(11)}px monospace`;
  ctx.fillStyle = 'rgba(180, 255, 200, 0.6)';
  // Short descriptor only (strip any "Level N — " prefix that might be in the JSON).
  const shortName = cfg.name.replace(/^Level\s*\d+\s*[—-]\s*/i, '');
  ctx.fillText(shortName, hudX + insigSize + Math.round(10 * sc), hudTopY + fs(16));

  const timeLeft = Math.max(0, cfg.duration - state.levelElapsed);
  // Right-side block: buttons up top, stats below
  drawButton(pauseButtonRect(W), state.paused ? 'Resume' : 'Pause', state.paused);
  drawButton(helpButtonRect(W), 'Help', state.overlay === 'help');
  drawButton(settingsButtonRect(W), 'Settings', state.overlay === 'settings');

  ctx.textAlign = 'right';
  ctx.font = `bold ${fs(13)}px monospace`;
  const statsY = pauseButtonRect(W).y + pauseButtonRect(W).h + Math.round(8 * sc);
  ctx.fillStyle = '#b6ffc4';
  ctx.fillText(`${timeLeft.toFixed(0)}s`, W - Math.round(12 * sc), statsY);
  ctx.fillStyle = '#ffd070';
  ctx.font = `bold ${fs(16)}px monospace`;
  ctx.fillText(`SCORE ${currentScore()}`, W - Math.round(12 * sc), statsY + fs(18));
  ctx.fillStyle = '#eaffe1';
  ctx.font = `${fs(12)}px monospace`;
  ctx.fillText(`DESTROYED ${state.enemiesDestroyed}`, W - Math.round(12 * sc), statsY + fs(38));

  drawHealthBar(hudX, hudTopY + insigSize + Math.round(8 * sc), Math.round(160 * sc), Math.round(12 * sc));

  // Persistent transmit hint at the bottom of the radar.
  ctx.fillStyle = 'rgba(200, 255, 210, 0.85)';
  ctx.font = `bold ${fs(13)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    isTouch ? 'TAP for dot · hold longer for dash · P pause' : 'SPACE for dot · hold longer for dash · P pause',
    layout.radar.x + layout.radar.w / 2,
    layout.radar.y + layout.radar.h - Math.round(8 * sc)
  );
}

// HUD button rectangles — chained right-to-left so spacing stays tight at
// any text scale.
function pauseButtonRect(W) {
  const s = textScale();
  const w = Math.round(88 * s), h = Math.round(30 * s);
  return { x: W - Math.round(8 * s) - w, y: Math.round(8 * s), w, h };
}
function settingsButtonRect(W) {
  const s = textScale();
  const w = Math.round(100 * s), h = Math.round(30 * s);
  const pr = pauseButtonRect(W);
  return { x: pr.x - Math.round(4 * s) - w, y: Math.round(8 * s), w, h };
}
function continueButtonRect(W, H) {
  const bw = Math.round(220 * textScale() * 0.8);
  const bh = Math.round(40 * textScale() * 0.8);
  // Sit inside the leaderboard modal's footer.
  const mw = Math.min(W * 0.8, 560);
  const mh = Math.min(H * 0.8, 460);
  const mx = (W - mw) / 2;
  const my = (H - mh) / 2;
  return { x: mx + (mw - bw) / 2, y: my + mh - bh - 14, w: bw, h: bh };
}

function helpButtonRect(W) {
  const s = textScale();
  const w = Math.round(72 * s), h = Math.round(30 * s);
  const sr = settingsButtonRect(W);
  return { x: sr.x - Math.round(4 * s) - w, y: Math.round(8 * s), w, h };
}

function drawButton(rect, label, active) {
  ctx.save();
  ctx.fillStyle = active ? 'rgba(120, 255, 160, 0.4)' : 'rgba(10, 28, 15, 0.9)';
  ctx.strokeStyle = active ? '#d0ffd8' : '#4eff6d';
  ctx.lineWidth = 1;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = '#eaffe1';
  ctx.font = `bold ${fs(15)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function drawHealthBar(x, y, w, h) {
  const frac = Math.max(0, state.health) / state.settings.maxHits;
  ctx.fillStyle = 'rgba(60, 20, 20, 0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = frac > 0.5 ? '#6afc90' : (frac > 0.25 ? '#ffd070' : '#ff6a6a');
  ctx.fillRect(x + 1, y + 1, (w - 2) * frac, h - 2);
  ctx.strokeStyle = 'rgba(180, 255, 200, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawBanner(W, H, msg) {
  const bw = Math.min(W * 0.8, 520);
  const bh = 44;
  const bx = (W - bw) / 2;
  const by = H * 0.14;
  ctx.fillStyle = 'rgba(80, 20, 20, 0.85)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#ff9a9a';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = '#ffe0e0';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, W / 2, by + bh / 2);
}

function drawLetterTooltip(W, H, layout) {
  const t = state.letterTooltip;
  if (!t) return;

  const cx = layout.radar.x + layout.radar.w / 2;
  const cy = layout.radar.y + Math.max(110, layout.radar.h * 0.18);
  const size = Math.min(W, H) * 0.055;
  const text = `${t.letter}  =  ${t.code}`;
  ctx.save();
  ctx.font = `bold ${Math.round(size)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const boxW = metrics.width + Math.round(size * 0.8);
  const boxH = size * 1.55;
  // Translucent backdrop so gameplay is still visible behind the tip.
  ctx.fillStyle = 'rgba(6, 20, 10, 0.55)';
  ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  ctx.strokeStyle = 'rgba(255, 208, 112, 0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - boxW / 2 + 1, cy - boxH / 2 + 1, boxW - 2, boxH - 2);
  ctx.fillStyle = '#ffd070';
  ctx.font = `bold ${Math.max(10, Math.round(size * 0.32))}px monospace`;
  ctx.textBaseline = 'bottom';
  ctx.fillText('NEW LETTER', cx, cy - boxH / 2 - 3);
  ctx.fillStyle = '#eaffe1';
  ctx.font = `bold ${Math.round(size)}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function drawScoreBubbles(W, H, layout) {
  if (!state.scoreBubbles || state.scoreBubbles.length === 0) return;
  const radarCx = layout.radar.x + layout.radar.w / 2;
  const radarCy = layout.radar.y + layout.radar.h / 2;
  const radius = Math.min(layout.radar.w, layout.radar.h) * 0.46;
  ctx.save();
  const fontSize = Math.round(20 * textScale());
  for (const b of state.scoreBubbles) {
    const prog = b.t / b.lifetime;
    const alpha = Math.max(0, 1 - prog);
    const rise = prog * 56;
    const ax = radarCx + b.nx * radius;
    const ay = radarCy + b.ny * radius - rise;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffd070';
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, ax, ay);
  }
  ctx.restore();
}

function drawPausedOverlay(rect) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 10, 5, 0.65)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(120, 255, 160, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.fillStyle = '#b6ffc4';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', rect.x + rect.w / 2, rect.y + rect.h / 2 - 10);
  ctx.font = '16px monospace';
  ctx.fillStyle = 'rgba(180, 255, 200, 0.85)';
  ctx.fillText(
    isTouch ? 'Tap to resume' : 'press P or SPACE to resume',
    rect.x + rect.w / 2, rect.y + rect.h / 2 + 34
  );
  ctx.restore();
}

// ---------- promotion UI ----------

function promotionModalButtons(W, H) {
  const mw = Math.min(W * 0.7, 540);
  const mh = Math.min(H * 0.6, 360);
  const mx = (W - mw) / 2;
  const my = (H - mh) / 2;
  const by = my + mh - 56;
  const bw = 160;
  const bh = 40;
  return {
    accept: { x: mx + mw / 2 - bw - 12, y: by, w: bw, h: bh },
    decline: { x: mx + mw / 2 + 12, y: by, w: bw, h: bh },
    modal: { x: mx, y: my, w: mw, h: mh },
  };
}

function promotionNotifRect(W, H) {
  // Locked to the bottom-right corner so it can't cover the radar sweep,
  // tower, enemies, or the code panel. Sized compact enough to sit above
  // the tape strip and the persistent transmit hint line.
  const s = textScale();
  const nw = Math.round(280 * s * 0.8);
  const nh = Math.round(66 * s * 0.8);
  const tapeH = Math.max(62, Math.min(96, Math.round(H * 0.1)));
  const reserve = tapeH + Math.round(34 * s); // clearance for the transmit hint
  const margin = Math.round(12 * s);
  return { x: W - nw - margin, y: H - reserve - nh - margin, w: nw, h: nh };
}

function promotionHintRect(W, H) {
  const s = textScale();
  const nw = Math.round(220 * s * 0.8);
  const nh = Math.round(30 * s * 0.8);
  const tapeH = Math.max(62, Math.min(96, Math.round(H * 0.1)));
  const reserve = tapeH + Math.round(34 * s);
  const margin = Math.round(12 * s);
  return { x: W - nw - margin, y: H - reserve - nh - margin, w: nw, h: nh };
}

function drawPromotion(W, H, layout) {
  if (!state.promotion) return;
  const p = state.promotion;
  const fromRank = rankFor(state.level);
  const toRank = rankFor(p.targetLevel);
  if (p.stage === 'intrusive') {
    drawPromotionIntrusive(W, H, fromRank, toRank, p.targetLevel);
  } else if (p.stage === 'notif') {
    drawPromotionNotif(W, H, toRank, p.targetLevel);
  } else {
    drawPromotionHint(W, H, toRank);
  }
}

function drawPromotionIntrusive(W, H, fromRank, toRank, targetLevel) {
  const r = promotionModalButtons(W, H).modal;
  const btns = promotionModalButtons(W, H);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 10, 5, 0.8)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10, 28, 15, 0.98)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#ffd070';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

  ctx.fillStyle = '#ffd070';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('PROMOTION', r.x + r.w / 2, r.y + 22);

  // Insignia
  drawInsignia(ctx, r.x + r.w / 2, r.y + 90, 48, targetLevel);

  ctx.fillStyle = '#eaffe1';
  ctx.font = '16px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`Congratulations! You have been promoted.`, r.x + r.w / 2, r.y + 134);
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`${fromRank}  →  ${toRank}`, r.x + r.w / 2, r.y + 162);
  ctx.font = '13px monospace';
  ctx.fillStyle = 'rgba(200, 255, 210, 0.8)';
  ctx.fillText('Accepting advances you to the next level.', r.x + r.w / 2, r.y + 196);
  ctx.fillText('Declining lets you stay at your current rank;', r.x + r.w / 2, r.y + 214);
  ctx.fillText('press ENTER any time to accept the promotion.', r.x + r.w / 2, r.y + 232);

  // Accept button — styled to match the Decline label below (unscaled 15px
  // bold monospace) for visual parity.
  ctx.save();
  ctx.fillStyle = 'rgba(120, 255, 160, 0.4)';
  ctx.strokeStyle = '#d0ffd8';
  ctx.lineWidth = 1;
  ctx.fillRect(btns.accept.x, btns.accept.y, btns.accept.w, btns.accept.h);
  ctx.strokeRect(btns.accept.x + 0.5, btns.accept.y + 0.5, btns.accept.w - 1, btns.accept.h - 1);
  ctx.fillStyle = '#eaffe1';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Accept (Enter)', btns.accept.x + btns.accept.w / 2, btns.accept.y + btns.accept.h / 2 + 1);
  ctx.restore();

  // Decline button styled amber
  ctx.save();
  ctx.fillStyle = 'rgba(60, 28, 10, 0.9)';
  ctx.strokeStyle = '#ffd070';
  ctx.fillRect(btns.decline.x, btns.decline.y, btns.decline.w, btns.decline.h);
  ctx.lineWidth = 1;
  ctx.strokeRect(btns.decline.x + 0.5, btns.decline.y + 0.5, btns.decline.w - 1, btns.decline.h - 1);
  ctx.fillStyle = '#ffe8b0';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Decline (Del)', btns.decline.x + btns.decline.w / 2, btns.decline.y + btns.decline.h / 2 + 1);
  ctx.restore();
  ctx.restore();
}

function drawPromotionNotif(W, H, toRank, targetLevel) {
  const r = promotionNotifRect(W, H);
  const insigSz = Math.round(r.h * 0.55);
  ctx.save();
  ctx.fillStyle = 'rgba(10, 28, 15, 0.94)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#ffd070';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  drawInsignia(ctx, r.x + Math.round(insigSz * 0.75), r.y + r.h / 2, insigSz, targetLevel);
  const textX = r.x + Math.round(insigSz * 1.3) + 6;
  ctx.fillStyle = '#ffd070';
  ctx.font = `bold ${fs(12)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PROMOTION', textX, r.y + Math.round(r.h * 0.14));
  ctx.fillStyle = '#eaffe1';
  ctx.font = `${fs(12)}px monospace`;
  ctx.fillText(`→ ${toRank}`, textX, r.y + Math.round(r.h * 0.44));
  ctx.fillStyle = 'rgba(200, 255, 210, 0.75)';
  ctx.font = `${fs(10)}px monospace`;
  ctx.fillText('ENTER / click: accept  ·  Del: later', textX, r.y + Math.round(r.h * 0.72));
  ctx.restore();
}

function drawPromotionHint(W, H, toRank) {
  const r = promotionHintRect(W, H);
  ctx.save();
  ctx.fillStyle = 'rgba(60, 40, 10, 0.9)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#ffd070';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = '#ffe8b0';
  ctx.font = `bold ${fs(10)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`ENTER → ${toRank}`, r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
}

// ---------- game loop ----------

function frame(now) {
  if (state.lastFrameTime == null) state.lastFrameTime = now;
  const dt = Math.min(0.05, (now - state.lastFrameTime) / 1000);
  state.lastFrameTime = now;
  if (state.scene === 'play' && !state.overlay && !state.paused) updatePlay(dt);
  else state.codeInput.update(dt);
  draw();
  requestAnimationFrame(frame);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

if (inBrowser) {
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerUp);
  resize();
  requestAnimationFrame(frame);
} else {
  canvas.width = (typeof innerWidth !== 'undefined' ? innerWidth : 1280);
  canvas.height = (typeof innerHeight !== 'undefined' ? innerHeight : 720);
}

export const _state = state;
