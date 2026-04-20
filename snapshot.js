#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output') out.output = argv[++i];
    else if (a === '--width') out.width = parseFloat(argv[++i]);
    else if (a === '--height') out.height = parseFloat(argv[++i]);
    else if (a === '--browserwidth') out.browserwidth = parseInt(argv[++i], 10);
    else if (a === '--browserheight') out.browserheight = parseInt(argv[++i], 10);
    else if (a === '--seed') out.seed = parseInt(argv[++i], 10);
    else if (a === '--scene') out.scene = argv[++i];
    else if (a === '--overlay') out.overlay = argv[++i];
    else if (a === '--level') out.level = parseInt(argv[++i], 10);
    else if (a === '--ticks') out.ticks = parseInt(argv[++i], 10);
    else if (a === '--enemies') out.enemies = argv[++i].split(',').filter(Boolean);
    else if (a === '--killed') out.killed = argv[++i].split(',').filter(Boolean);
    else if (a === '--code') out.code = argv[++i];
    else if (a === '--health') out.health = parseInt(argv[++i], 10);
    else if (a === '--destroyed') out.destroyed = parseInt(argv[++i], 10);
    else if (a === '--banner') out.banner = argv[++i];
    else if (a === '--paused') out.paused = argv[++i] !== 'false';
    else if (a === '--interface') out.interface = argv[++i];
    else if (a === '--press') out.press = argv[++i];
    else if (a === '--letters') out.letters = argv[++i];
    else if (a === '--explainerindex' || a === '--explainerIndex') out.explainerIndex = parseInt(argv[++i], 10);
    else if (a === '--promotion') out.promotion = argv[++i];
    else if (a === '--pressedForMs' || a === '--pressed') out.pressedForMs = parseInt(argv[++i], 10);
    else if (a === '--tooltipLetter' || a === '--tooltip') out.tooltipLetter = argv[++i];
    else if (a === '--scorebubbles') out.scoreBubbles = argv[++i].split(',');
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const BW = args.browserwidth ?? 1280;
const BH = args.browserheight ?? 720;
let W = args.width ?? BW;
let H = args.height ?? BH;
if (W > 0 && W < 1) W = Math.round(BW * W);
if (H > 0 && H < 1) H = Math.round(BH * H);

if (args.help || ![BW, BH, W, H, args.seed].every(n => Number.isFinite(n) && n > 0)) {
  console.error([
    'Usage: node snapshot.js [options]',
    '  --output <path>          output file (default snapshots/snapshot.png)',
    '  --browserwidth <px>      simulated browser width (default 1280)',
    '  --browserheight <px>     simulated browser height (default 720)',
    '  --width <px|frac>        crop width (px, or fraction of browserwidth)',
    '  --height <px|frac>       crop height',
    '  --seed <n>               seeded Math.random (default 42)',
    '  --scene <name>           title|play|dead',
    '  --overlay <name>         help|settings',
    '  --level <n>              level number (1..N)',
    '  --ticks <n>              run N update ticks before drawing',
    '  --enemies <A,BC,...>     spawn these enemy strings',
    '  --killed <A,B,...>       mark these letters as killed',
    '  --code <...>             pre-fill current morse code (e.g. ".-")',
    '  --health <n>             override current health',
    '  --destroyed <n>          override destroyed count',
    '  --banner <msg>           show an invalid-key banner',
  ].join('\n'));
  process.exit(args.help ? 0 : 1);
}

// Seeded Math.random so snapshots are deterministic.
let rngState = args.seed | 0;
Math.random = function () {
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Mock a minimal browser environment for main.js.
const browserCanvas = createCanvas(BW, BH);
global.window = global;
global.document = {
  getElementById: id => (id === 'game' ? browserCanvas : null),
};
global.innerWidth = BW;
global.innerHeight = BH;
global.addEventListener = () => {};
if (!('navigator' in global) || !global.navigator) {
  try { Object.defineProperty(global, 'navigator', { value: {}, configurable: true, writable: true }); } catch (_) {}
}
// Keep localStorage absent so settings/progress load defaults.

const { draw } = await import('./src/main.js');
const drawOptions = {};
if (args.scene) drawOptions.scene = args.scene;
if (args.overlay) drawOptions.overlay = args.overlay;
if (args.level) drawOptions.level = args.level;
if (args.enemies) drawOptions.spawnEnemies = args.enemies;
if (args.ticks) drawOptions.ticks = args.ticks;
if (args.killed) drawOptions.killedLetters = args.killed;
if (args.code) drawOptions.currentCode = args.code;
if (args.health !== undefined) drawOptions.health = args.health;
if (args.destroyed !== undefined) drawOptions.destroyed = args.destroyed;
if (args.banner) drawOptions.invalidBanner = args.banner;
if (args.paused !== undefined) drawOptions.paused = args.paused;
if (args.interface) drawOptions.interface = args.interface;
if (args.explainerIndex !== undefined) drawOptions.explainerIndex = args.explainerIndex;
if (args.letters) drawOptions.letterStamps = args.letters.split('').filter(Boolean);
if (args.promotion) {
  drawOptions.promotion = {
    targetLevel: (args.level || 1) + 1,
    stage: args.promotion,
  };
}
if (args.pressedForMs !== undefined) drawOptions.pressedForMs = args.pressedForMs;
if (args.tooltipLetter) drawOptions.tooltipLetter = args.tooltipLetter;
if (args.scoreBubbles) drawOptions.scoreBubbles = args.scoreBubbles;
if (args.press) {
  // Encoding: `.` or `-` emit a press; `|` = char gap (3u) before next press;
  // ` ` = word gap (7u); default in-letter spacing is 1u.
  const entries = [];
  let gapUnits = 0;
  for (const ch of args.press) {
    if (ch === '.' || ch === '-') {
      entries.push({ sym: ch, gapUnits });
      gapUnits = 1;
    } else if (ch === '|') gapUnits = 3;
    else if (ch === ' ') gapUnits = 7;
  }
  if (entries.length) entries[0].gapUnits = 0;
  drawOptions.press = entries;
}
if (args.scene === 'dead') {
  drawOptions.lastRun = {
    destroyed: args.destroyed ?? 12,
    charsSent: 48,
    cpm: 16.8,
    survivedSec: 172.3,
    levelReached: args.level ?? 3,
    score: ((args.destroyed ?? 12) * 100) + ((args.level ?? 3) * 50),
    highScore: 2000,
    newHighScore: true,
    rank: 2,
    total: 7,
  };
}

draw(drawOptions);

const outCanvas = createCanvas(W, H);
const outCtx = outCanvas.getContext('2d');
const sx = Math.round((BW - W) / 2);
const sy = Math.round((BH - H) / 2);
outCtx.drawImage(browserCanvas, sx, sy, W, H, 0, 0, W, H);

const outFile = path.resolve(args.output || path.join(__dirname, 'snapshots', 'snapshot.png'));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, outCanvas.toBuffer('image/png'));
console.log(`wrote ${outFile}`);
process.exit(0);
