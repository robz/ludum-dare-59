// Morse Code Typing Game — main entry point.
//
// Scenes:   'title' | 'play' | 'dead'
// Overlays: help (H), settings (S)
//
// Exports draw(options) so snapshot.js can render any scene headlessly.

import { CodeInput } from './codeInput.js';
import { AttackView } from './attackView.js';
import { MorseInput } from './morseInput.js';
import { SettingsOverlay, loadSettings, saveSettings, DEFAULTS } from './settings.js';
import { loadProgress, saveProgress } from './progress.js';
import { drawHelp } from './help.js';
import { drawLeaderboard } from './leaderboard.js';
import { LEVELS, getLevel, levelCount } from './levels.js';
import { ALL_LETTERS, parentLetter, codeToLetter } from './morse.js';
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
  const codeInput = new CodeInput();
  const attackView = new AttackView({ enemySpeed: LEVELS[0].enemySpeed });
  const morseInput = new MorseInput({
    unit: settings.unitMs,
    onSymbol,
    onCharacterComplete,
    onPressStart: () => { if (state.scene === 'play') startMorseTone(); },
    onPressEnd: () => stopMorseTone(),
  });
  const settingsOverlay = new SettingsOverlay(settings);
  setVolume(settings.volume);

  const s = {
    scene: 'title',
    overlay: null, // 'help' | 'settings' | null
    level: 1,
    levelStartTime: 0,
    levelElapsed: 0,
    gameElapsed: 0,
    spawnCountdown: 0,
    health: settings.maxHits,
    charsSent: 0,
    enemiesDestroyed: 0,
    levelReached: 1,
    killedLetters: new Set(),
    invalidBanner: null, // { msg, until }
    titleLevelPick: Math.max(1, Math.min(progress.maxLevel, levelCount())),
    codeInput, attackView, morseInput, settingsOverlay,
    settings, progress,
    lastFrameTime: null,
  };
  return s;
}

function onSymbol(symbol) {
  state.codeInput.advance(symbol);
}

function onCharacterComplete(code) {
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
    if (result.completed) state.killedLetters.add(letter);
  } else {
    playError();
  }
}

// ---------- game control ----------

function startGame(fromLevel = 1) {
  state.scene = 'play';
  state.level = fromLevel;
  state.levelReached = Math.max(state.levelReached, fromLevel);
  state.levelElapsed = 0;
  state.gameElapsed = 0;
  state.spawnCountdown = 1.0;
  state.health = state.settings.maxHits;
  state.charsSent = 0;
  state.enemiesDestroyed = 0;
  state.killedLetters = new Set();
  state.codeInput = new CodeInput();
  state.attackView = new AttackView({ enemySpeed: getLevel(fromLevel).enemySpeed });
  state.morseInput.setUnit(state.settings.unitMs);
  state.morseInput.reset();
  state.invalidBanner = null;
}

function advanceLevel() {
  if (state.level >= levelCount()) {
    // Loop the hardest level
    state.levelElapsed = 0;
    return;
  }
  state.level += 1;
  state.levelReached = Math.max(state.levelReached, state.level);
  state.levelElapsed = 0;
  state.spawnCountdown = 1.0;
  state.attackView.setEnemySpeed(getLevel(state.level).enemySpeed);
  // Save progress once per level reached
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
  state.morseInput.reset();
  stopMorseTone();
}

// ---------- spawning ----------

function pickAvailableLetter() {
  // In level 1, enforce tree-order introduction. Higher levels allow any letter
  // since words can already contain arbitrary letters.
  if (state.level === 1) {
    const pool = ALL_LETTERS.filter(l => {
      const p = parentLetter(l);
      return p === null || state.killedLetters.has(p);
    });
    if (pool.length === 0) return 'E';
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return ALL_LETTERS[Math.floor(Math.random() * ALL_LETTERS.length)];
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

  // Spawn enemies
  state.spawnCountdown -= dt;
  const active = state.attackView.activeCount();
  if (state.spawnCountdown <= 0 && active < cfg.maxActive && state.levelElapsed < cfg.duration) {
    state.attackView.spawn(pickSpawnText());
    const [mn, mx] = cfg.spawnInterval;
    state.spawnCountdown = mn + Math.random() * (mx - mn);
  }

  // Update attack view
  const r = state.attackView.update(dt);
  if (r.damageTaken > 0) {
    state.health -= r.damageTaken;
    playDamage();
    if (state.health <= 0) die();
  }
  if (r.destroyed > 0) {
    state.enemiesDestroyed += r.destroyed;
    playExplosion();
  }

  state.codeInput.update(dt);

  // Banner expiry
  if (state.invalidBanner && performance.now() > state.invalidBanner.until) {
    state.invalidBanner = null;
  }

  // Level advance: when timer runs out AND no active enemies
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

const HOTKEYS = new Set([' ', 'h', 'H', 's', 'S', 'Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
for (let i = 1; i <= 9; i++) HOTKEYS.add(String(i));

function handleKeyDown(e) {
  resumeAudio();

  // Global toggles for overlays (from any scene)
  if (e.key === 'h' || e.key === 'H') {
    if (state.scene === 'play' || state.scene === 'title') {
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

  if (state.overlay === 'settings') {
    const res = state.settingsOverlay.handleKey(e.key);
    if (res.changed === 'volume') setVolume(state.settings.volume);
    if (res.changed === 'unitMs') state.morseInput.setUnit(state.settings.unitMs);
    if (res.changed === 'reset') {
      setVolume(state.settings.volume);
      state.morseInput.setUnit(state.settings.unitMs);
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
    }
    e.preventDefault();
    return;
  }

  // Playing
  if (e.key === ' ') {
    if (!e.repeat) {
      state.morseInput.pressStart();
    }
    e.preventDefault();
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    // Debug: jump to level
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= levelCount()) {
      state.level = n;
      state.levelReached = Math.max(state.levelReached, n);
      state.levelElapsed = 0;
      state.killedLetters = new Set();
      state.attackView = new AttackView({ enemySpeed: getLevel(n).enemySpeed });
      state.spawnCountdown = 0.3;
    }
    e.preventDefault();
    return;
  }
  if (!HOTKEYS.has(e.key)) {
    // Invalid key — show banner
    state.invalidBanner = {
      msg: isTouch ? 'Send transmissions by tapping' : 'Send transmissions with spacebar',
      until: performance.now() + 1600,
    };
    playError();
  }
}

function handleKeyUp(e) {
  if (state.scene !== 'play') return;
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
  const hRect = helpButtonRect(canvas.width);
  const sRect = settingsButtonRect(canvas.width);
  if (state.scene === 'play' || state.scene === 'title') {
    if (pointInRect(px, py, hRect)) {
      setOverlay(state.overlay === 'help' ? null : 'help');
      return;
    }
    if (pointInRect(px, py, sRect)) {
      setOverlay(state.overlay === 'settings' ? null : 'settings');
      return;
    }
  }
  if (state.scene === 'title') {
    startGame(state.titleLevelPick);
    return;
  }
  if (state.scene === 'dead') {
    state.scene = 'title';
    return;
  }
  if (state.overlay) {
    setOverlay(null);
    return;
  }
  if (state.scene === 'play') {
    state.morseInput.pressStart();
  }
}

function handlePointerUp() {
  if (state.scene !== 'play') return;
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
    const splitY = Math.round(H * 0.66);
    const radarRect = { x: 0, y: 0, w: W, h: splitY };
    const codeRect  = { x: 0, y: splitY, w: W, h: H - splitY };
    state.attackView.draw(ctx, radarRect, { now: performance.now() });
    state.codeInput.draw(ctx, codeRect, {
      isPressed: state.morseInput.isPressed(),
      currentCode: state.codeInput.getCurrentCode(),
    });
    drawHud(W, H);
  }

  if (state.scene === 'dead' && state.lastRun) {
    drawLeaderboard(ctx, { x: 0, y: 0, w: W, h: H }, state.lastRun);
  }

  if (state.overlay === 'help') {
    drawHelp(ctx, { x: 0, y: 0, w: W, h: H }, state.codeInput.getUsedLetters());
  } else if (state.overlay === 'settings') {
    state.settingsOverlay.draw(ctx, { x: 0, y: 0, w: W, h: H });
  }

  if (state.invalidBanner) {
    drawBanner(W, H, state.invalidBanner.msg);
  }
}

function applyOverrides(options) {
  if (options.scene) state.scene = options.scene;
  if (options.overlay !== undefined) state.overlay = options.overlay;
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
  if (options.currentCode) {
    for (const c of options.currentCode) state.codeInput.advance(c);
    state.codeInput.animElapsed = 999; // finish anim
  }
  if (options.invalidBanner) {
    state.invalidBanner = { msg: options.invalidBanner, until: performance.now() + 5000 };
  }
  if (options.lastRun) state.lastRun = options.lastRun;
}

function drawTitle(W, H) {
  // Radar-ish background
  const cx = W / 2, cy = H * 0.42;
  const rad = Math.min(W, H) * 0.32;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  g.addColorStop(0, 'rgba(40, 120, 60, 0.4)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, rad * (i / 4), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#b6ffc4';
  ctx.font = `bold ${Math.round(Math.min(W, H) * 0.08)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MORSE TOWER', cx, cy);

  ctx.fillStyle = '#8fffa1';
  ctx.font = `${Math.round(Math.min(W, H) * 0.022)}px monospace`;
  ctx.fillText('shoot down incoming transmissions', cx, cy + rad * 0.28);

  // Level select
  const selY = H * 0.78;
  const maxPick = Math.min(state.progress.maxLevel || 1, levelCount());
  const cfg = getLevel(state.titleLevelPick);
  ctx.fillStyle = '#eaffe1';
  ctx.font = `${Math.round(Math.min(W, H) * 0.03)}px monospace`;
  ctx.fillText(`◂ LEVEL ${state.titleLevelPick} / ${levelCount()} ▸`, cx, selY);
  ctx.font = `${Math.round(Math.min(W, H) * 0.02)}px monospace`;
  ctx.fillStyle = '#b6ffc4';
  ctx.fillText(cfg.name, cx, selY + 26);
  if (state.titleLevelPick > maxPick) {
    ctx.fillStyle = '#ff9a9a';
    ctx.fillText('(not yet unlocked — debug)', cx, selY + 46);
  }

  ctx.fillStyle = 'rgba(200, 255, 210, 0.85)';
  ctx.font = `${Math.round(Math.min(W, H) * 0.024)}px monospace`;
  ctx.fillText(isTouch ? 'tap to begin' : 'press SPACE to begin', cx, H * 0.92);
  ctx.fillStyle = 'rgba(160, 220, 180, 0.6)';
  ctx.font = `${Math.round(Math.min(W, H) * 0.018)}px monospace`;
  ctx.fillText('H help · S settings · ←/→ level', cx, H * 0.96);

  drawButton(helpButtonRect(W), '?', state.overlay === 'help');
  drawButton(settingsButtonRect(W), '*', state.overlay === 'settings');
}

function drawHud(W, H) {
  const cfg = getLevel(state.level);
  // Top-left: level
  ctx.fillStyle = '#b6ffc4';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`LV ${state.level}  ${cfg.name}`, 12, 10);

  // Top-right: time left, destroyed — offset to leave room for buttons
  ctx.textAlign = 'right';
  const timeLeft = Math.max(0, cfg.duration - state.levelElapsed);
  ctx.fillText(`${timeLeft.toFixed(0)}s`, W - 92, 10);
  ctx.fillStyle = '#eaffe1';
  ctx.fillText(`DESTROYED ${state.enemiesDestroyed}`, W - 92, 28);

  // Top-left bottom: health bar
  drawHealthBar(12, 30, 140, 12);

  // Top-right buttons
  drawButton(helpButtonRect(W), '?', state.overlay === 'help');
  drawButton(settingsButtonRect(W), '*', state.overlay === 'settings');

  // Bottom-left: unit (debug) if enabled
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

function drawButton(rect, label, active) {
  ctx.save();
  ctx.fillStyle = active ? 'rgba(120, 255, 160, 0.4)' : 'rgba(10, 28, 15, 0.8)';
  ctx.strokeStyle = active ? '#d0ffd8' : '#4eff6d';
  ctx.lineWidth = 1;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = '#eaffe1';
  ctx.font = 'bold 16px monospace';
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

// ---------- game loop ----------

function frame(now) {
  if (state.lastFrameTime == null) state.lastFrameTime = now;
  const dt = Math.min(0.05, (now - state.lastFrameTime) / 1000);
  state.lastFrameTime = now;
  if (state.scene === 'play' && !state.overlay) updatePlay(dt);
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
  // Snapshot environment: set up a sensible canvas size from globals.
  canvas.width = (typeof innerWidth !== 'undefined' ? innerWidth : 1280);
  canvas.height = (typeof innerHeight !== 'undefined' ? innerHeight : 720);
}

// Exposed for tests / snapshot.
export const _state = state;
