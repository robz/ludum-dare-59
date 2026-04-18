#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

function parseArgs(argv) {
  const out = { level: 1, width: 1280, height: 720, seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--level') out.level = parseInt(argv[++i], 10);
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--width') out.width = parseInt(argv[++i], 10);
    else if (a === '--height') out.height = parseInt(argv[++i], 10);
    else if (a === '--seed') out.seed = parseInt(argv[++i], 10);
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

const { level, output, width: WIDTH, height: HEIGHT, seed, help } = parseArgs(process.argv.slice(2));
if (help || ![level, WIDTH, HEIGHT, seed].every(Number.isFinite)) {
  console.error('Usage: node snapshot.js [--level <n>] [--output <path>] [--width <px>] [--height <px>] [--seed <n>]');
  process.exit(help ? 0 : 1);
}

// Seed Math.random with mulberry32 so successive runs produce identical output.
let rngState = seed | 0;
Math.random = function () {
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const canvas = createCanvas(WIDTH, HEIGHT);

const audioParam = {
  value: 0,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
};
const audioNode = () => ({
  frequency: { ...audioParam },
  gain: { ...audioParam },
  type: '',
  connect() { return audioNode(); },
  disconnect() {},
  start() {},
  stop() {},
  onended: null,
});
class AudioContextStub {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = audioNode();
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createOscillator() { return audioNode(); }
  createGain() { return audioNode(); }
  createAnalyser() {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0.65,
      connect() {},
      disconnect() {},
      getFloatTimeDomainData() {},
      getFloatFrequencyData() {},
    };
  }
  createMediaStreamSource() { return audioNode(); }
}

global.window = global;
global.document = { getElementById: id => (id === 'game' ? canvas : null) };
global.navigator = {
  mediaDevices: { getUserMedia: () => Promise.reject(new Error('no mic')) },
};
global.innerWidth = WIDTH;
global.innerHeight = HEIGHT;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.AudioContext = AudioContextStub;
global.webkitAudioContext = AudioContextStub;

const mainSrc = fs.readFileSync(path.join(__dirname, 'src', 'main.js'), 'utf8');
const runner = new Function(
  mainSrc + '\n;return { render(n) { level = n; setup(); draw(); } };'
);
const api = runner();
api.render(level);

const outFile = path.resolve(
  output || path.join(__dirname, 'snapshots', `level_${level}.png`)
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, canvas.toBuffer('image/png'));
console.log(`wrote ${outFile}`);
