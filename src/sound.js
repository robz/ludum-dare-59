// Lightweight WebAudio sound effects. Falls back to silent no-ops when
// AudioContext is unavailable (e.g., during snapshots in node).

let ctx = null;
let master = null;
let morseOsc = null;
let morseGain = null;

function ensureCtx() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

export function resumeAudio() {
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setVolume(v) {
  if (!master) ensureCtx();
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

// Morse beep: starts a tone at the keying frequency; call stopMorseTone() to end.
export function startMorseTone(freq = 620) {
  const c = ensureCtx();
  if (!c) return;
  if (morseOsc) stopMorseTone();
  morseOsc = c.createOscillator();
  morseGain = c.createGain();
  morseOsc.type = 'sine';
  morseOsc.frequency.value = freq;
  morseGain.gain.value = 0;
  morseGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 0.01);
  morseOsc.connect(morseGain);
  morseGain.connect(master);
  morseOsc.start();
}

export function stopMorseTone() {
  if (!ctx || !morseOsc) return;
  try {
    morseGain.gain.cancelScheduledValues(ctx.currentTime);
    morseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
    morseOsc.stop(ctx.currentTime + 0.04);
  } catch (_) {}
  morseOsc = null;
  morseGain = null;
}

function blip({ freq = 440, duration = 0.1, type = 'sine', volume = 0.5, slide = 0 }) {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + duration);
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(volume, c.currentTime + 0.008);
  g.gain.linearRampToValueAtTime(0, c.currentTime + duration);
  osc.connect(g); g.connect(master);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

function noiseBurst({ duration = 0.3, volume = 0.6, filterFreq = 1200 }) {
  const c = ensureCtx();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

export function playFire() { blip({ freq: 900, duration: 0.12, type: 'square', slide: -500, volume: 0.3 }); }
export function playExplosion() { noiseBurst({ duration: 0.35, volume: 0.5, filterFreq: 900 }); }
export function playDamage() { blip({ freq: 180, duration: 0.35, type: 'sawtooth', slide: -120, volume: 0.4 }); }
export function playError() { blip({ freq: 220, duration: 0.18, type: 'square', slide: -40, volume: 0.25 }); }
export function playTransmit() { blip({ freq: 1300, duration: 0.08, type: 'sine', volume: 0.25 }); }
