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
  console.error('Usage: node snapshot.js [--output <path>] [--browserwidth <px>] [--browserheight <px>] [--width <px|frac>] [--height <px|frac>] [--centerx <px>] [--centery <px>] [--seed <n>]');
  process.exit(args.help ? 0 : 1);
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
global.document = {
  getElementById: id => (id === 'game' ? browserCanvas : null),
  createElement: tag => (tag === 'canvas' ? createCanvas(1, 1) : null),
};
global.innerWidth = BW;
global.innerHeight = BH;
global.addEventListener = () => {};
global.requestAnimationFrame = () => 0;

const { draw } = await import('./src/main.js');
if (args.centerx !== undefined || args.centery !== undefined) {
  draw(args.centerx, args.centery);
}

const outCanvas = createCanvas(W, H);
const outCtx = outCanvas.getContext('2d');
const sx = Math.round((BW - W) / 2);
const sy = Math.round((BH - H) / 2);
outCtx.drawImage(browserCanvas, sx, sy, W, H, 0, 0, W, H);

const outFile = path.resolve(args.output || path.join(__dirname, 'snapshots', 'snapshot.png'));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, outCanvas.toBuffer('image/png'));
console.log(`wrote ${outFile}`);
