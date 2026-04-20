// Morse Defense — main entry point.
//
// Scenes:   'title' | 'play' | 'dead'
// Overlays: help (title only) | settings (title or play)
//
// Exports draw(options) so snapshot.js can render any scene headlessly.

import { CodeInputTree } from './codeInputTree.js';
import { CodeInputSliding } from './codeInputSliding.js';
import { AttackView } from './attackView.js';
import { MorseInput } from './morseInput.js';
import { SettingsOverlay, loadSettings, saveSettings } from './settings.js';
import { loadProgress, saveProgress } from './progress.js';
import { drawHelp } from './help.js';
import { drawLeaderboard } from './leaderboard.js';
import { drawTape } from './tape.js';
import { LEVELS, getLevel, levelCount } from './levels.js';
import { ALL_LETTERS, LETTER_TO_CODE, parentLetter, codeToLetter } from './morse.js';
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
    onSymbol,
    onCharacterComplete,
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
    destroyCount: new Map(), // letter -> count of single-letter kills
    killedLetters: new Set(), // any letter destroyed at least once (for title / tree lighting)
    invalidBanner: null,
    titleLevelPick: 1, // on refresh, always start on first level
    codeInput, attackView, morseInput, settingsOverlay,
    settings, progress,
    lastFrameTime: null,
    lastRun: null,
  };
}

function makeCodeInput(kind) {
  return kind === 'sliding' ? new CodeInputSliding() : new CodeInputTree();
}

function swapCodeInterface(kind) {
  const oldUsed = state.codeInput.getUsedLetters();
  state.codeInput = makeCodeInput(kind);
  for (const l of oldUsed) state.codeInput.markUsed(l);
}

function onSymbol(symbol) {
  if (state.scene !== 'play' || state.paused) return;
  state.codeInput.advance(symbol);
}

function onCharacterComplete(code) {
  if (state.scene !== 'play' || state.paused) {
    state.codeInput.reset();
    return;
  }
  const letter = codeToLetter(code);
  if (!letter) {
    state.codeInput.resetFlash('?', false);
    playError();
    return;
  }
  state.charsSent += 1;
  playTransmit();
  const result = state.attackView.fire(letter);
  state.codeInput.resetFlash(letter, result.hit);
  if (result.hit) {
    playFire();
    state.codeInput.markUsed(letter);
    state.killedLetters.add(letter);
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
  state.codeInput = makeCodeInput(state.settings.interface);
  state.attackView = new AttackView({ enemySpeed: getLevel(fromLevel).enemySpeed });
  state.morseInput.setUnit(state.settings.unitMs);
  state.morseInput.reset();
  state.invalidBanner = null;
}

function advanceLevel() {
  if (state.level >= levelCount()) {
    state.levelElapsed = 0;
    return;
  }
  state.level += 1;
  state.levelReached = Math.max(state.levelReached, state.level);
  state.levelElapsed = 0;
  state.spawnCountdown = 1.0;
  state.attackView.setEnemySpeed(getLevel(state.level).enemySpeed);
  state.progress.maxLevel = Math.max(state.progress.maxLevel, state.level);
  saveProgress(state.progress);
}

function die() {
  const destroyed = state.enemiesDestroyed;
  const score = destroyed * 100 + state.level * 50;
  const newHigh = score > (state.progress.highScore || 0);
  if (newHigh) state.progress.highScore = score;
  state.progress.maxLevel = Math.max(state.progress.maxLevel || 1, state.levelReached);
  saveProgress(state.progress);
  state.lastRun = {
    destroyed,
    charsSent: state.charsSent,
    survivedSec: state.gameElapsed,
    cpm: state.gameElapsed > 0 ? (state.charsSent * 60) / state.gameElapsed : 0,
    levelReached: state.levelReached,
    highScore: state.progress.highScore || 0,
    maxLevel: state.progress.maxLevel || 1,
    newHighScore: newHigh,
  };
  state.scene = 'dead';
  state.overlay = null;
  state.paused = false;
  state.morseInput.reset();
  stopMorseTone();
}

function togglePause() {
  if (state.scene !== 'play') return;
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
  if (p === null) return true; // depth-1 letters always allowed
  if ((counts.get(p) || 0) < 2) return false;
  // All peers at depth (d-1) must have at least 1 destroy.
  const peerDepth = depth - 1;
  for (const peer of ALL_LETTERS) {
    if (LETTER_TO_CODE[peer].length !== peerDepth) continue;
    if ((counts.get(peer) || 0) < 1) return false;
  }
  return true;
}

function pickAvailableLetter() {
  const pool = ALL_LETTERS.filter(letterAllowed);
  if (pool.length === 0) return 'E';
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickSpawnText() {
  const cfg = getLevel(state.level);
  if (cfg.mode === 'letters') return pickAvailableLetter();
  const words = cfg.words || [];
  if (cfg.mode === 'mixed') {
    if (Math.random() < 0.4 || words.length === 0) return pickAvailableLetter();
    return words[Math.floor(Math.random() * words.length)];
  }
  if (words.length === 0) return pickAvailableLetter();
  return words[Math.floor(Math.random() * words.length)];
}

function updatePlay(dt) {
  state.levelElapsed += dt;
  state.gameElapsed += dt;
  const cfg = getLevel(state.level);

  state.spawnCountdown -= dt;
  const active = state.attackView.activeCount();
  if (state.spawnCountdown <= 0 && active < cfg.maxActive && state.levelElapsed < cfg.duration) {
    state.attackView.spawn(pickSpawnText());
    const [mn, mx] = cfg.spawnInterval;
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
  }

  state.codeInput.update(dt);

  if (state.invalidBanner && performance.now() > state.invalidBanner.until) {
    state.invalidBanner = null;
  }

  if (state.levelElapsed >= cfg.duration && state.attackView.activeCount() === 0) {
    advanceLevel();
  }
}

function setOverlay(next) {
  if (state.overlay === next) return;
  state.overlay = next;
  if (next) {
    state.morseInput.reset();
    stopMorseTone();
  }
}

// ---------- input ----------

const HOTKEYS = new Set([' ', 'h', 'H', 's', 'S', 'p', 'P', 'Escape', 'Enter',
                          'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
for (let i = 1; i <= 9; i++) HOTKEYS.add(String(i));

function handleKeyDown(e) {
  resumeAudio();

  // Help — only accessible from title screen
  if (e.key === 'h' || e.key === 'H') {
    if (state.scene === 'title') {
      setOverlay(state.overlay === 'help' ? null : 'help');
    }
    e.preventDefault();
    return;
  }
  if (e.key === 's' || e.key === 'S') {
    if (state.scene === 'play' || state.scene === 'title') {
      setOverlay(state.overlay === 'settings' ? null : 'settings');
    }
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

  if (state.overlay === 'settings') {
    const res = state.settingsOverlay.handleKey(e.key);
    if (res.changed === 'volume') setVolume(state.settings.volume);
    if (res.changed === 'unitMs') state.morseInput.setUnit(state.settings.unitMs);
    if (res.changed === 'interface') swapCodeInterface(state.settings.interface);
    if (res.changed === 'reset') {
      setVolume(state.settings.volume);
      state.morseInput.setUnit(state.settings.unitMs);
      swapCodeInterface(state.settings.interface);
    }
    if (res.changed === 'maxHits') {
      if (state.scene !== 'play') state.health = state.settings.maxHits;
      else if (state.health > state.settings.maxHits) state.health = state.settings.maxHits;
    }
    e.preventDefault();
    return;
  }

  if (state.overlay === 'help') return;

  if (state.scene === 'title') {
    if (e.key === 'Enter' || e.key === ' ') {
      startGame(state.titleLevelPick);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      state.titleLevelPick = Math.max(1, state.titleLevelPick - 1);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      state.titleLevelPick = Math.min(Math.min(state.progress.maxLevel, levelCount()), state.titleLevelPick + 1);
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      state.titleLevelPick = Math.min(parseInt(e.key, 10), levelCount());
      e.preventDefault();
      return;
    }
    return;
  }

  if (state.scene === 'dead') {
    if (e.key === ' ' || e.key === 'Enter') {
      state.scene = 'title';
      state.titleLevelPick = 1;
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
      state.attackView = new AttackView({ enemySpeed: getLevel(n).enemySpeed });
      state.spawnCountdown = 0.3;
    }
    e.preventDefault();
    return;
  }
  if (!HOTKEYS.has(e.key)) {
    state.invalidBanner = {
      msg: isTouch ? 'Send transmissions by tapping' : 'Send transmissions with spacebar',
      until: performance.now() + 1600,
    };
    playError();
  }
}

function handleKeyUp(e) {
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

  // Buttons
  const sRect = settingsButtonRect(canvas.width);
  const pRect = pauseButtonRect(canvas.width);
  const hRect = helpButtonRect(canvas.width);
  if ((state.scene === 'play' || state.scene === 'title')
      && pointInRect(px, py, sRect)) {
    setOverlay(state.overlay === 'settings' ? null : 'settings');
    return;
  }
  if (state.scene === 'play' && pointInRect(px, py, pRect) && !state.overlay) {
    togglePause();
    return;
  }
  if (state.scene === 'title' && pointInRect(px, py, hRect)) {
    setOverlay(state.overlay === 'help' ? null : 'help');
    return;
  }

  if (state.overlay) {
    setOverlay(null);
    return;
  }
  if (state.scene === 'title') { startGame(state.titleLevelPick); return; }
  if (state.scene === 'dead') { state.scene = 'title'; state.titleLevelPick = 1; return; }
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
    drawTape(ctx, layout.tape, state.morseInput, performance.now());
    state.codeInput.draw(ctx, layout.code, {
      isPressed: state.morseInput.isPressed(),
      orientation: landscape ? 'landscape' : 'portrait',
    });
    drawHud(W, H, layout);
    if (state.paused) drawPausedOverlay(layout.radar);
  }

  if (state.scene === 'dead' && state.lastRun) {
    drawLeaderboard(ctx, { x: 0, y: 0, w: W, h: H }, state.lastRun);
  }

  if (state.overlay === 'help') {
    drawHelp(ctx, { x: 0, y: 0, w: W, h: H }, state.codeInput.getUsedLetters());
  } else if (state.overlay === 'settings') {
    state.settingsOverlay.draw(ctx, { x: 0, y: 0, w: W, h: H });
  }

  if (state.invalidBanner) drawBanner(W, H, state.invalidBanner.msg);
}

function computeLayout(W, H, landscape) {
  const tapeH = Math.max(54, Math.min(80, Math.round(H * 0.09)));
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
}

function drawTitle(W, H) {
  const cx = W / 2;
  const landscape = W >= H;
  const titleY = H * (landscape ? 0.13 : 0.09);

  // Subtle radar backdrop behind title
  ctx.save();
  const rad = Math.min(W, H) * 0.24;
  const gr = ctx.createRadialGradient(cx, titleY + rad * 0.1, 0, cx, titleY + rad * 0.1, rad);
  gr.addColorStop(0, 'rgba(40, 120, 60, 0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(cx, titleY + rad * 0.1, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#b6ffc4';
  ctx.font = `bold ${Math.round(Math.min(W, H) * (landscape ? 0.08 : 0.07))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MORSE DEFENSE', cx, titleY);

  ctx.fillStyle = '#eaffe1';
  ctx.font = `${Math.round(Math.min(W, H) * 0.028)}px monospace`;
  ctx.fillText(
    isTouch ? 'Tap to shoot an enemy' : 'Press SPACE or click to shoot an enemy',
    cx, titleY + Math.round(Math.min(W, H) * 0.065)
  );

  // Explainer box
  const explainerY = titleY + Math.round(Math.min(W, H) * 0.13);
  const explainerW = Math.min(W * 0.82, 780);
  drawMorseExplainer(cx - explainerW / 2, explainerY, explainerW, Math.min(H * 0.42, 280));

  // Level select
  const maxPick = Math.min(state.progress.maxLevel || 1, levelCount());
  const cfg = getLevel(state.titleLevelPick);
  const selY = H * (landscape ? 0.82 : 0.84);
  ctx.fillStyle = '#eaffe1';
  ctx.font = `${Math.round(Math.min(W, H) * 0.028)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`◂ LEVEL ${state.titleLevelPick} / ${levelCount()} ▸`, cx, selY);
  ctx.font = `${Math.round(Math.min(W, H) * 0.02)}px monospace`;
  ctx.fillStyle = '#b6ffc4';
  ctx.fillText(cfg.name, cx, selY + 26);
  if (state.titleLevelPick > maxPick) {
    ctx.fillStyle = '#ff9a9a';
    ctx.fillText('(not yet unlocked — debug)', cx, selY + 46);
  }

  ctx.fillStyle = 'rgba(160, 220, 180, 0.7)';
  ctx.font = `${Math.round(Math.min(W, H) * 0.018)}px monospace`;
  ctx.fillText('H help · S settings · ←/→ level', cx, H * 0.96);

  drawButton(helpButtonRect(W), '?', state.overlay === 'help');
  drawButton(settingsButtonRect(W), '*', state.overlay === 'settings');
}

function drawMorseExplainer(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 28, 15, 0.65)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = '#b6ffc4';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('HOW MORSE CODE WORKS', x + 14, y + 12);

  ctx.fillStyle = 'rgba(220, 255, 230, 0.85)';
  ctx.font = '13px monospace';
  ctx.fillText('One unit of time = a dot. A dash = three units. Symbols inside a letter', x + 14, y + 36);
  ctx.fillText('sit one unit apart; letters are three units apart; words are seven.', x + 14, y + 54);

  // Visual timeline: morse for "A B" = .- / -... spaced correctly
  // .(1) _(1) -(3) _(3) -(3) _(1) .(1) _(1) .(1) _(1) .(1)  [ _(7) next word ]
  // Use unit = 14px, bar height = 16px
  const timelineY = y + 86;
  const unit = Math.max(10, Math.min(16, Math.floor((w - 40) / 42)));
  const barH = 18;
  let tx = x + 20;
  const sequence = [
    { sym: '.' }, { gap: 1 }, { sym: '-' }, { gap: 3, boundary: 'char' },
    { sym: '-' }, { gap: 1 }, { sym: '.' }, { gap: 1 }, { sym: '.' }, { gap: 1 }, { sym: '.' },
    { gap: 7, boundary: 'word' },
    { sym: '-' },
  ];
  // Labels A / B / T for reference
  ctx.fillStyle = 'rgba(200, 255, 210, 0.6)';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('A', tx + unit * 1.3, timelineY - 18);
  ctx.fillText('B', tx + unit * 9,   timelineY - 18);
  ctx.fillText('T', tx + unit * 24,  timelineY - 18);

  for (const s of sequence) {
    if (s.sym) {
      const widthUnits = s.sym === '-' ? 3 : 1;
      ctx.fillStyle = '#6afc90';
      ctx.fillRect(tx, timelineY, widthUnits * unit, barH);
      tx += widthUnits * unit;
    } else if (s.gap) {
      if (s.boundary === 'char') {
        ctx.fillStyle = 'rgba(120, 190, 255, 0.3)';
        ctx.fillRect(tx, timelineY, s.gap * unit, barH);
        ctx.fillStyle = '#a7cfff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('letter gap', tx + (s.gap * unit) / 2, timelineY + barH + 3);
      } else if (s.boundary === 'word') {
        ctx.fillStyle = 'rgba(255, 200, 90, 0.25)';
        ctx.fillRect(tx, timelineY, s.gap * unit, barH);
        ctx.fillStyle = '#ffd070';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('word gap', tx + (s.gap * unit) / 2, timelineY + barH + 3);
      }
      tx += s.gap * unit;
    }
  }
  // Legend
  ctx.fillStyle = 'rgba(200, 255, 210, 0.85)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('· dot = 1 unit     — dash = 3 units', x + 14, y + h - 32);
  ctx.fillStyle = 'rgba(200, 255, 210, 0.65)';
  ctx.fillText('Press H for the full letter tree.', x + 14, y + h - 14);
  ctx.restore();
}

function drawHud(W, H, layout) {
  const cfg = getLevel(state.level);
  ctx.fillStyle = '#b6ffc4';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`LV ${state.level}  ${cfg.name}`, layout.radar.x + 12, 10);

  ctx.textAlign = 'right';
  const timeLeft = Math.max(0, cfg.duration - state.levelElapsed);
  ctx.fillText(`${timeLeft.toFixed(0)}s`, W - 120, 10);
  ctx.fillStyle = '#eaffe1';
  ctx.fillText(`DESTROYED ${state.enemiesDestroyed}`, W - 120, 28);

  drawHealthBar(layout.radar.x + 12, 30, 140, 12);

  drawButton(pauseButtonRect(W), state.paused ? '▶' : '||', state.paused);
  drawButton(settingsButtonRect(W), '*', state.overlay === 'settings');

  // Persistent transmit hint anchored to radar area
  ctx.fillStyle = 'rgba(200, 255, 210, 0.85)';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    isTouch ? 'TAP to transmit · tap & hold for dash' : 'SPACE to transmit · hold for dash · P pause',
    layout.radar.x + layout.radar.w / 2,
    layout.radar.y + layout.radar.h - 8
  );

  if (state.settings.showUnit) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(180, 255, 200, 0.8)';
    ctx.font = '11px monospace';
    ctx.fillText(`unit ${Math.round(state.morseInput.getUnit())} ms`, 12, H - 10);
  }
}

function helpButtonRect(W) { return { x: W - 78, y: 8, w: 32, h: 32 }; }
function settingsButtonRect(W) { return { x: W - 42, y: 8, w: 32, h: 32 }; }
function pauseButtonRect(W) { return { x: W - 78, y: 8, w: 32, h: 32 }; }

function drawButton(rect, label, active) {
  ctx.save();
  ctx.fillStyle = active ? 'rgba(120, 255, 160, 0.4)' : 'rgba(10, 28, 15, 0.85)';
  ctx.strokeStyle = active ? '#d0ffd8' : '#4eff6d';
  ctx.lineWidth = 1;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = '#eaffe1';
  ctx.font = 'bold 14px monospace';
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
    isTouch ? 'tap ▶ or anywhere to resume' : 'press P or SPACE to resume',
    rect.x + rect.w / 2, rect.y + rect.h / 2 + 34
  );
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
