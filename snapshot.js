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
    else if (a === '--centerx') out.centerx = parseFloat(argv[++i]);
    else if (a === '--centery') out.centery = parseFloat(argv[++i]);
    else if (a === '--seed') out.seed = parseInt(argv[++i], 10);
    else if (a === '--plant') out.plant = argv[++i];
    else if (a === '--all') out.all = true;
    else if (a === '--bird') out.bird = argv[++i];
    else if (a === '--birdmode') out.birdmode = argv[++i];
    else if (a === '--all-birds') out.allBirds = true;
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
  console.error('Usage: node snapshot.js [--output <path>] [--browserwidth <px>] [--browserheight <px>] [--width <px|frac>] [--height <px|frac>] [--centerx <px>] [--centery <px>] [--seed <n>] [--plant <name>] [--all] [--bird <name>] [--birdmode perch|fly|both] [--all-birds]');
  process.exit(args.help ? 0 : 1);
}

if (args.all) {
  const { spawnSync } = await import('child_process');
  const plants = ['conifer','broadleaf','dogwood','holly','hazel','bramble','fern','wildflower','grass','moss','mushroom','log','litter'];
  const outDir = args.output || path.join(__dirname, 'snapshots', 'all');
  fs.mkdirSync(outDir, { recursive: true });
  const commonArgs = ['--browserwidth', String(BW), '--browserheight', String(BH), '--seed', String(args.seed)];
  for (const p of plants) {
    const r = spawnSync('node', ['snapshot.js', ...commonArgs, '--plant', p, '--output', path.join(outDir, `${p}.png`)], { stdio: 'inherit', cwd: __dirname });
    if (r.status !== 0) process.exit(r.status || 1);
  }
  spawnSync('node', ['snapshot.js', ...commonArgs, '--output', path.join(outDir, 'forest.png')], { stdio: 'inherit', cwd: __dirname });
  process.exit(0);
}

if (args.allBirds) {
  const { spawnSync } = await import('child_process');
  const birds = ['chickadee','owl','robin','duck','mockingbird'];
  const outDir = args.output || path.join(__dirname, 'snapshots', 'birds');
  fs.mkdirSync(outDir, { recursive: true });
  const commonArgs = ['--browserwidth', String(BW), '--browserheight', String(BH), '--seed', String(args.seed)];
  for (const b of birds) {
    for (const mode of ['perch','fly','both']) {
      const r = spawnSync('node', ['snapshot.js', ...commonArgs, '--bird', b, '--birdmode', mode, '--output', path.join(outDir, `${b}_${mode}.png`)], { stdio: 'inherit', cwd: __dirname });
      if (r.status !== 0) process.exit(r.status || 1);
    }
  }
  process.exit(0);
}

let rngState = args.seed | 0;
Math.random = function () {
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const browserCanvas = createCanvas(BW, BH);
global.window = global;
global.document = { getElementById: id => (id === 'game' ? browserCanvas : null) };
global.innerWidth = BW;
global.innerHeight = BH;
global.addEventListener = () => {};
global.SEED = args.seed;
if (args.plant) global.ONLY_PLANT = args.plant;
if (args.bird) global.ONLY_BIRD = args.bird;
if (args.birdmode) global.BIRD_MODE = args.birdmode;

if (args.bird) {
  await import('./src/birds.js');
} else {
  await import('./src/main.js');
}

const outCanvas = createCanvas(W, H);
const outCtx = outCanvas.getContext('2d');
const cx = args.centerx ?? BW / 2;
const cy = args.centery ?? BH / 2;
const sx = Math.round(cx - W / 2);
const sy = Math.round(cy - H / 2);
outCtx.drawImage(browserCanvas, sx, sy, W, H, 0, 0, W, H);

const outFile = path.resolve(args.output || path.join(__dirname, 'snapshots', 'snapshot.png'));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, outCanvas.toBuffer('image/png'));
console.log(`wrote ${outFile}`);
