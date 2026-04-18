const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ONLY_BIRD = (typeof globalThis !== 'undefined' && globalThis.ONLY_BIRD) || null;
const BIRD_MODE = (typeof globalThis !== 'undefined' && globalThis.BIRD_MODE) || 'both';

function resize() {
  canvas.width = (typeof window !== 'undefined' && window.innerWidth) || canvas.width;
  canvas.height = (typeof window !== 'undefined' && window.innerHeight) || canvas.height;
}
if (typeof window !== 'undefined' && window.addEventListener && !ONLY_BIRD) {
  window.addEventListener('resize', resize);
  resize();
}

// Random helper with slight variation: V(base, fraction) → base * (1 ± fraction)
const V = (v, pct) => v * (1 + (Math.random() - 0.5) * 2 * pct);

// ============== AUDIO ==============
let audio = null;
function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

const birdAudio = [null, null, null, null];

function getBirdAudio(i) {
  ensureAudio();
  if (!birdAudio[i]) {
    const analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.4;
    const gain = audio.createGain();
    gain.gain.value = 1;
    gain.connect(analyser);
    analyser.connect(audio.destination);
    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 128;
    const scx = sc.getContext('2d');
    scx.fillStyle = '#0a0a14';
    scx.fillRect(0, 0, sc.width, sc.height);
    birdAudio[i] = {
      gain, analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
      sc, scx,
      activeSources: [],
    };
  }
  return birdAudio[i];
}

function stopBirdAudio(i) {
  const ba = birdAudio[i];
  if (!ba) return;
  const now = audio.currentTime;
  for (const o of ba.activeSources) {
    try { o.stop(now + 0.05); } catch (e) {}
  }
  ba.activeSources = [];
  ba.gain.gain.cancelScheduledValues(now);
  ba.gain.gain.setValueAtTime(ba.gain.gain.value, now);
  ba.gain.gain.linearRampToValueAtTime(0, now + 0.04);
  setTimeout(() => {
    if (audio) ba.gain.gain.setValueAtTime(1, audio.currentTime);
  }, 80);
}

// Clean whistle — pure sine, easy for humans to match.
// freq: number or [[t_offset, hz], ...] waypoints (linear ramps).
function whistle(ba, t0, freq, duration, gainLevel = 0.2) {
  const o = audio.createOscillator();
  o.type = 'sine';
  const g = audio.createGain();
  const attack = Math.min(0.025, duration * 0.25);
  const release = Math.min(0.07, duration * 0.35);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gainLevel, t0 + attack);
  g.gain.setValueAtTime(gainLevel, t0 + duration - release);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + duration);

  if (typeof freq === 'number') {
    o.frequency.setValueAtTime(freq, t0);
  } else {
    o.frequency.setValueAtTime(freq[0][1], t0 + freq[0][0]);
    for (let i = 1; i < freq.length; i++) {
      o.frequency.linearRampToValueAtTime(freq[i][1], t0 + freq[i][0]);
    }
  }

  o.connect(g).connect(ba.gain);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
  ba.activeSources.push(o);
  o.onended = () => {
    const idx = ba.activeSources.indexOf(o);
    if (idx >= 0) ba.activeSources.splice(idx, 1);
  };
}

// Hoot — real barred owl hoots are nearly pure sine tones at 300-450 Hz with:
//   - a dominant fundamental and quiet low harmonics
//   - subtle pitch wavering (FM vibrato, NOT amplitude tremolo)
//   - soft onset/offset envelope
//   - slight pitch dip at the very start and very end ("sag")
function hoot(ba, t0, freq, duration, gainLevel = 0.4) {
  let envelope;
  if (typeof freq === 'number') {
    // Natural hoot contour: starts slightly flat, rises to peak, levels, then sags
    envelope = [
      [0,                              freq * 0.97],
      [0.12,                           freq * 1.02],
      [Math.max(0.14, duration - 0.2), freq * 1.00],
      [duration,                       freq * 0.92],
    ];
  } else {
    envelope = freq;
  }
  const baseFreq = envelope[0][1];

  // Slow shared vibrato LFO at ~3 Hz — natural owl wavering
  const lfo = audio.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 3.2;
  lfo.start(t0);
  lfo.stop(t0 + duration + 0.15);
  ba.activeSources.push(lfo);

  const addPartial = (mult, amp) => {
    const o = audio.createOscillator();
    o.type = 'sine';

    // Apply pitch envelope (scaled by harmonic multiplier)
    o.frequency.setValueAtTime(envelope[0][1] * mult, t0 + envelope[0][0]);
    for (let i = 1; i < envelope.length; i++) {
      o.frequency.linearRampToValueAtTime(envelope[i][1] * mult, t0 + envelope[i][0]);
    }

    // FM vibrato — ~1.5% pitch modulation at 3.2 Hz. Pitch mod (not amplitude) is
    // what gives the natural "wavering" of a live hoot.
    const vibDepth = audio.createGain();
    vibDepth.gain.value = baseFreq * mult * 0.015;
    lfo.connect(vibDepth).connect(o.frequency);

    // Smooth amplitude envelope — slow attack and release
    const g = audio.createGain();
    const attack = Math.min(0.06, duration * 0.22);
    const release = Math.min(0.12, duration * 0.38);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + attack);
    g.gain.setValueAtTime(amp, t0 + duration - release);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + duration);

    o.connect(g).connect(ba.gain);
    o.start(t0);
    o.stop(t0 + duration + 0.1);
    ba.activeSources.push(o);
    o.onended = () => {
      const idx = ba.activeSources.indexOf(o);
      if (idx >= 0) ba.activeSources.splice(idx, 1);
    };
  };

  // Fundamental (the main "hoo" pitch)
  addPartial(1.0, gainLevel);
  // Subtle 2nd harmonic — adds warmth/body without making it buzzy
  addPartial(2.0, gainLevel * 0.22);
  // Very quiet 3rd harmonic — tiny brightness
  addPartial(3.0, gainLevel * 0.06);
}

// Short noise burst (for chatter/rattle calls). Filtered pink-ish noise.
function burst(ba, t0, centerFreq, duration, gainLevel = 0.2) {
  const sr = audio.sampleRate;
  const len = Math.max(1, Math.floor(sr * duration));
  const buf = audio.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  // brownian-ish noise
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + (Math.random() - 0.5) * 0.3) * 0.95;
    d[i] = last;
  }
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = centerFreq;
  filter.Q.value = 6;
  const g = audio.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gainLevel, t0 + 0.003);
  g.gain.setValueAtTime(gainLevel, t0 + duration * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + duration);
  src.connect(filter).connect(g).connect(ba.gain);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
  ba.activeSources.push(src);
  src.onended = () => {
    const idx = ba.activeSources.indexOf(src);
    if (idx >= 0) ba.activeSources.splice(idx, 1);
  };
}

// ============== VOCALIZATIONS ==============
// Each bird has songs[] (full territorial song) and calls[] (brief contact/alarm).
// Slight variation on every invocation.

// -- Chickadee --
function songChickadee(ba) {
  const t = audio.currentTime + 0.05;
  const base = V(4000, 0.04);
  const ratio = V(0.84, 0.01); // minor third down
  whistle(ba, t, V(base, 0.005), V(0.38, 0.08), 0.22);
  whistle(ba, t + V(0.45, 0.05), [[0, base * ratio], [0.5, base * ratio * 0.97]], V(0.5, 0.08), 0.22);
}
function callChickadee(ba) {
  // "chick-a-dee-dee-dee" — short chatter
  const t = audio.currentTime + 0.05;
  // "chick" — sharp burst
  burst(ba, t + 0.00, V(4200, 0.05), 0.05, 0.25);
  // "a"
  burst(ba, t + 0.08, V(3600, 0.05), 0.04, 0.18);
  // "dee" x3 — short nasal notes descending slightly
  const deeCount = 3 + (Math.random() < 0.3 ? 1 : 0);
  for (let k = 0; k < deeCount; k++) {
    const t0 = t + 0.18 + k * V(0.11, 0.04);
    const f = V(3200 - k * 80, 0.04);
    whistle(ba, t0, [[0, f], [0.08, f * 0.93]], 0.1, 0.2);
  }
}

// -- Barred Owl --
function songBarredOwl(ba) {
  const t = audio.currentTime + 0.05;
  const f = V(310, 0.03); // ~310 Hz is typical barred owl hoot pitch
  const g = 0.38;
  hoot(ba, t + 0.00,             f * V(1.00, 0.01), V(0.35, 0.08), g);
  hoot(ba, t + V(0.42, 0.05),    f * V(1.10, 0.01), V(0.25, 0.08), g);
  hoot(ba, t + V(0.72, 0.05),    f * V(0.96, 0.01), V(0.25, 0.08), g);
  hoot(ba, t + V(1.00, 0.05),    [[0, f * 0.92], [0.55, f * 0.72]], V(0.6, 0.08), g);
  hoot(ba, t + V(2.10, 0.05),    f * V(1.00, 0.01), V(0.35, 0.08), g);
  hoot(ba, t + V(2.52, 0.05),    f * V(1.10, 0.01), V(0.25, 0.08), g);
  hoot(ba, t + V(2.82, 0.05),    f * V(0.96, 0.01), V(0.25, 0.08), g);
  hoot(ba, t + V(3.10, 0.05),    f * V(0.94, 0.01), V(0.22, 0.08), g);
  hoot(ba, t + V(3.35, 0.05),    [[0, f * 0.92], [1.0, f * 0.55]], V(1.1, 0.1), g);
}
function callBarredOwl(ba) {
  // Single "hoo-AWW" contact hoot, falling
  const t = audio.currentTime + 0.05;
  const f = V(310, 0.03);
  hoot(ba, t + 0.00, [[0, f * 1.02], [0.15, f * 1.05], [0.8, f * 0.6]], V(0.9, 0.1), 0.4);
}

// -- American Robin --
const ROBIN_PHRASES = [
  (ba, t, g) => {
    whistle(ba, t + 0.00, [[0, V(2200, 0.03)], [0.2, V(2420, 0.03)]], 0.22, g);
    whistle(ba, t + 0.28, [[0, V(2050, 0.03)], [0.2, V(1950, 0.03)]], 0.22, g);
    whistle(ba, t + 0.56, [[0, V(2500, 0.03)], [0.2, V(2720, 0.03)]], 0.22, g);
    return 0.9;
  },
  (ba, t, g) => {
    whistle(ba, t + 0.00, V(2300, 0.03), 0.11, g);
    whistle(ba, t + 0.14, V(2650, 0.03), 0.11, g);
    whistle(ba, t + 0.28, V(2000, 0.03), 0.11, g);
    whistle(ba, t + 0.42, V(2400, 0.03), 0.11, g);
    return 0.65;
  },
  (ba, t, g) => {
    whistle(ba, t + 0.00, [[0, V(2500, 0.03)], [0.25, V(2600, 0.03)]], 0.28, g);
    whistle(ba, t + 0.35, [[0, V(2100, 0.03)], [0.25, V(1900, 0.03)]], 0.3, g);
    return 0.75;
  },
];
function songRobin(ba) {
  let t = audio.currentTime + 0.05;
  const g = 0.18;
  const count = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const phrase = ROBIN_PHRASES[Math.floor(Math.random() * ROBIN_PHRASES.length)];
    const dur = phrase(ba, t, g);
    t += dur + V(0.35, 0.1);
  }
}
function callRobin(ba) {
  // Sharp "tut-tut-tut-tut" alarm chatter
  const t = audio.currentTime + 0.05;
  const count = 4 + Math.floor(Math.random() * 3);
  for (let k = 0; k < count; k++) {
    const t0 = t + k * V(0.08, 0.05);
    burst(ba, t0, V(2800, 0.06), 0.035, 0.22);
  }
}

// -- Duck quack --
// Acoustics of a real mallard quack:
//   1. Pitch sweep: fundamental starts ~650 Hz and rapidly falls to ~320 Hz in ~150ms
//   2. Formants: strong nasal peak at ~1200-1500 Hz (gives the "a-a-ack" nasal character)
//   3. Rasp: 25-30 Hz amplitude modulation from aperiodic vocal-cord vibration — this is
//      the key "duck" quality vs a pure tone
//   4. Attack noise: brief broadband burst at onset (the "Q" consonant)
//   5. Very sharp attack (~5ms), gradual decay
function quack(ba, t0, freq, duration, gainLevel) {
  // Main source: sawtooth (rich harmonics to be sculpted by formant filter)
  const o = audio.createOscillator();
  o.type = 'sawtooth';
  // Pitch contour: quick rise at onset, then steady fall (characteristic "GWACK")
  o.frequency.setValueAtTime(freq * 0.85, t0);
  o.frequency.linearRampToValueAtTime(freq * 1.2, t0 + 0.02);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + duration);

  // Nasal formant — bandpass around 1300 Hz. This is the "a-ack" resonance.
  const formant1 = audio.createBiquadFilter();
  formant1.type = 'bandpass';
  formant1.frequency.value = 1300;
  formant1.Q.value = 2.5;

  // Second formant around 2500 Hz — gives the "quack" bite
  const formant2 = audio.createBiquadFilter();
  formant2.type = 'bandpass';
  formant2.frequency.value = 2500;
  formant2.Q.value = 3;

  // Amplitude rasp — 28 Hz AM, deep modulation gives the "rattly" quack quality
  const rasp = audio.createGain();
  rasp.gain.value = 1;
  const raspLFO = audio.createOscillator();
  raspLFO.type = 'sawtooth'; // sawtooth LFO gives sharper rasp than sine
  raspLFO.frequency.value = 28;
  const raspDepth = audio.createGain();
  raspDepth.gain.value = 0.45;
  raspLFO.connect(raspDepth).connect(rasp.gain);
  raspLFO.start(t0);
  raspLFO.stop(t0 + duration + 0.05);

  // Envelope
  const env = audio.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gainLevel, t0 + 0.005);      // very sharp attack
  env.gain.setValueAtTime(gainLevel, t0 + duration * 0.2);
  env.gain.linearRampToValueAtTime(gainLevel * 0.6, t0 + duration * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0005, t0 + duration);

  // Parallel formants: osc -> formant1 -> rasp -> env -> ba.gain
  //                    osc -> formant2 -> (mixes into same rasp)
  o.connect(formant1).connect(rasp);
  o.connect(formant2).connect(rasp);
  rasp.connect(env).connect(ba.gain);

  o.start(t0);
  o.stop(t0 + duration + 0.05);
  ba.activeSources.push(o, raspLFO);
  o.onended = () => {
    for (const s of [o, raspLFO]) {
      const idx = ba.activeSources.indexOf(s);
      if (idx >= 0) ba.activeSources.splice(idx, 1);
    }
  };

  // Attack noise burst — short broadband "Q" at the start
  const nLen = Math.floor(audio.sampleRate * 0.02);
  const nBuf = audio.createBuffer(1, nLen, audio.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nLen);
  const noise = audio.createBufferSource();
  noise.buffer = nBuf;
  const nFilter = audio.createBiquadFilter();
  nFilter.type = 'bandpass';
  nFilter.frequency.value = 1800;
  nFilter.Q.value = 0.9;
  const nGain = audio.createGain();
  nGain.gain.value = gainLevel * 0.7;
  noise.connect(nFilter).connect(nGain).connect(ba.gain);
  noise.start(t0);
  ba.activeSources.push(noise);
  noise.onended = () => {
    const idx = ba.activeSources.indexOf(noise);
    if (idx >= 0) ba.activeSources.splice(idx, 1);
  };
}

// Song: "QUACK-quack-quack-quack-quack" — loud first, trailing descending quacks
function songWoodDuck(ba) {
  const t = audio.currentTime + 0.05;
  const baseF = V(520, 0.05);
  const count = 4 + Math.floor(Math.random() * 3); // 4-6 quacks
  let t0 = t;
  let f = baseF;
  for (let k = 0; k < count; k++) {
    const dur = k === 0 ? V(0.22, 0.1) : V(0.15, 0.1);
    const gain = k === 0 ? 0.32 : 0.2 * Math.pow(0.9, k - 1);
    quack(ba, t0, f, dur, gain);
    t0 += dur + V(0.1, 0.2);
    f *= V(0.93, 0.02);
  }
}
// Call: 1-2 sharp quacks
function callWoodDuck(ba) {
  const t = audio.currentTime + 0.05;
  quack(ba, t, V(500, 0.06), V(0.2, 0.1), 0.3);
  if (Math.random() < 0.6) {
    quack(ba, t + V(0.28, 0.05), V(460, 0.06), V(0.17, 0.1), 0.24);
  }
}

// ============== BIRD DRAWINGS ==============
// All drawings use s = body-length scale. Drawn facing left.

// -- helpers --
function ellipse(cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
function stroke(line, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(line[0][0], line[0][1]);
  for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
  ctx.stroke();
}
function eye(cx, cy, r, highlightX, highlightY) {
  ctx.fillStyle = '#0a0a0a';
  ellipse(cx, cy, r, r);
  ctx.fillStyle = '#ffffff';
  ellipse(cx + (highlightX ?? -r * 0.25), cy + (highlightY ?? -r * 0.3), r * 0.28, r * 0.28);
}

// Simple perch branch under bird.
function drawPerch(cx, y, w) {
  ctx.fillStyle = '#3a2818';
  ctx.beginPath();
  ctx.moveTo(cx - w, y);
  ctx.quadraticCurveTo(cx, y + 4, cx + w, y);
  ctx.lineTo(cx + w, y + 6);
  ctx.quadraticCurveTo(cx, y + 10, cx - w, y + 6);
  ctx.closePath();
  ctx.fill();
  // highlight
  ctx.fillStyle = '#5a4028';
  ctx.fillRect(cx - w * 0.8, y + 1, w * 1.6, 1);
}

// ===== CHICKADEE =====
const CHICKADEE_COLORS = {
  cap: '#111',
  cheek: '#fbf7e4',
  bib: '#111',
  back: '#7f7a68',
  wing: '#5a5646',
  wingEdge: '#c4bca2',
  flank: '#d8a872',
  belly: '#f0e6c8',
  bill: '#1a1612',
  leg: '#352d22',
};

// Chickadee perched: fat teardrop body, big head on top, short tail down-back.
function drawChickadeePerched(cx, cy, s) {
  const C = CHICKADEE_COLORS;
  // branch
  drawPerch(cx, cy + s * 0.58, s * 0.85);
  // legs
  stroke([[cx - s * 0.08, cy + s * 0.38], [cx - s * 0.1, cy + s * 0.58]], C.leg, Math.max(2, s * 0.035));
  stroke([[cx + s * 0.12, cy + s * 0.38], [cx + s * 0.1, cy + s * 0.58]], C.leg, Math.max(2, s * 0.035));

  // Unified silhouette — head + body + tail as one path (uses cheek color for whole body,
  // so pale cheek shows through automatically; flank/back colors painted on top via clip)
  ctx.fillStyle = C.cheek;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.68, cy - s * 0.1);              // bill base
  ctx.quadraticCurveTo(cx - s * 0.78, cy - s * 0.4, cx - s * 0.55, cy - s * 0.52); // forehead
  ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.62, cx + s * 0.12, cy - s * 0.5);  // crown to nape
  ctx.quadraticCurveTo(cx + s * 0.32, cy - s * 0.35, cx + s * 0.4, cy - s * 0.15); // back slope
  ctx.lineTo(cx + s * 0.9, cy - s * 0.05);              // tail top
  ctx.lineTo(cx + s * 0.88, cy + s * 0.15);             // tail bottom
  ctx.quadraticCurveTo(cx + s * 0.55, cy + s * 0.15, cx + s * 0.45, cy + s * 0.3); // under-tail
  ctx.quadraticCurveTo(cx + s * 0.1, cy + s * 0.6, cx - s * 0.35, cy + s * 0.45); // belly curve
  ctx.quadraticCurveTo(cx - s * 0.65, cy + s * 0.25, cx - s * 0.68, cy - s * 0.02); // throat
  ctx.closePath();
  ctx.fill();

  // Pale belly - clip to silhouette
  ctx.save();
  ctx.clip();
  // Buffy FLANK stripe — horizontal tan band down the side (matches flight pose)
  ctx.fillStyle = C.flank;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.02, cy + s * 0.22, s * 0.48, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pale belly (smaller, centered on front/under so flank stripe stays visible)
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.2, cy + s * 0.38, s * 0.25, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Back/wing region (darker over top)
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.55);
  ctx.quadraticCurveTo(cx + s * 0.4, cy - s * 0.35, cx + s * 0.5, cy + s * 0.0);
  ctx.lineTo(cx + s * 0.9, cy - s * 0.05);
  ctx.lineTo(cx + s * 0.88, cy + s * 0.15);
  ctx.lineTo(cx + s * 0.45, cy + s * 0.2);
  ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 0.05, cx + s * 0.0, cy - s * 0.3);
  ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 0.5, cx - s * 0.1, cy - s * 0.55);
  ctx.closePath();
  ctx.fill();
  // Folded wing (a neat shape along the side)
  ctx.fillStyle = C.wing;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.05, cy - s * 0.2);
  ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.15, cx + s * 0.42, cy + s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.25, cy + s * 0.25, cx + s * 0.05, cy + s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.02, cy - s * 0.05, cx + s * 0.05, cy - s * 0.2);
  ctx.closePath();
  ctx.fill();
  // pale wing edge (single feather line)
  ctx.strokeStyle = C.wingEdge;
  ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.08, cy + s * 0.18);
  ctx.quadraticCurveTo(cx + s * 0.25, cy + s * 0.22, cx + s * 0.4, cy + s * 0.12);
  ctx.stroke();
  // Black cap — goes over top of head and down nape to shoulders
  ctx.fillStyle = C.cap;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s * 0.2);
  ctx.quadraticCurveTo(cx - s * 0.72, cy - s * 0.42, cx - s * 0.55, cy - s * 0.52);
  ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.62, cx + s * 0.12, cy - s * 0.5);
  ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 0.4, cx + s * 0.1, cy - s * 0.3);
  ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 0.22, cx - s * 0.35, cy - s * 0.22); // cap line through eye level
  ctx.lineTo(cx - s * 0.7, cy - s * 0.2);
  ctx.closePath();
  ctx.fill();
  // Black bib — neat rounded patch at throat/chin only
  ctx.fillStyle = C.bib;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.68, cy - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.55, cy + s * 0.15, cx - s * 0.35, cy + s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.28, cy - s * 0.08, cx - s * 0.45, cy - s * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Eye — small, within cap
  ctx.fillStyle = '#000';
  ellipse(cx - s * 0.48, cy - s * 0.3, s * 0.04, s * 0.04);
  ctx.fillStyle = '#fff';
  ellipse(cx - s * 0.49, cy - s * 0.31, s * 0.015, s * 0.015);
  // Bill — small triangle, pointing forward
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.66, cy - s * 0.18);
  ctx.lineTo(cx - s * 0.82, cy - s * 0.14);
  ctx.lineTo(cx - s * 0.66, cy - s * 0.1);
  ctx.closePath();
  ctx.fill();
}

// Flying drawings: all birds shown as SIDE PROFILE facing LEFT.
// flapPhase: 0 = wings down (just past the horizontal), 1 = wings up (high above body).
// Wings visibly rise/fall above the body; body bobs slightly.
// Draw order: FAR WING (offset shoulder) → BODY + TAIL → color regions → NEAR WING → head details.

function drawChickadeeFlying(cx, cy, s, flapPhase = 0.65) {
  const C = CHICKADEE_COLORS;
  // Body bobs UP slightly during downstroke (phase→0), DOWN during upstroke (phase→1)
  const by = cy + (flapPhase - 0.5) * s * 0.05;

  // === FAR WING — points UP-FORWARD (opposite horizontal direction from near wing).
  // Shared shoulder position near body center; wing mirrors across vertical axis.
  const shX = cx - s * 0.02;
  const shY = by + s * 0.02;
  const spanFar = s * 0.55;
  const far = wingTipFromPhase(shX, shY, spanFar, flapPhase, false, -1);
  sideWing(shX, shY, far.tipX, far.tipY, s * 0.14, '#55503e', '#2a2620');

  // === BODY + HEAD silhouette — compact, round-headed (matches perched proportions) ===
  ctx.fillStyle = C.cheek;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, by + s * 0.02);          // bill base
  ctx.quadraticCurveTo(cx - s * 0.58, by - s * 0.24, cx - s * 0.32, by - s * 0.28); // forehead
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.26, cx + s * 0.12, by - s * 0.18); // crown to back
  ctx.lineTo(cx + s * 0.45, by - s * 0.08);
  ctx.lineTo(cx + s * 0.78, by - s * 0.04);          // short tail top
  ctx.lineTo(cx + s * 0.78, by + s * 0.1);           // tail bottom
  ctx.lineTo(cx + s * 0.45, by + s * 0.12);
  ctx.quadraticCurveTo(cx + s * 0.1, by + s * 0.26, cx - s * 0.25, by + s * 0.22);  // belly
  ctx.quadraticCurveTo(cx - s * 0.5, by + s * 0.12, cx - s * 0.55, by + s * 0.02);  // throat
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Buffy flanks
  ctx.fillStyle = C.flank;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.05, by + s * 0.16, s * 0.45, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pale belly
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.05, by + s * 0.22, s * 0.3, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // Darker back
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.0, by - s * 0.26);
  ctx.quadraticCurveTo(cx + s * 0.3, by - s * 0.22, cx + s * 0.45, by - s * 0.08);
  ctx.lineTo(cx + s * 0.78, by - s * 0.04);
  ctx.lineTo(cx + s * 0.78, by + s * 0.02);
  ctx.quadraticCurveTo(cx + s * 0.35, by - s * 0.06, cx + s * 0.08, by - s * 0.17);
  ctx.closePath();
  ctx.fill();
  // Darker squared tail
  ctx.fillStyle = C.wing;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.45, by - s * 0.08);
  ctx.lineTo(cx + s * 0.78, by - s * 0.04);
  ctx.lineTo(cx + s * 0.78, by + s * 0.1);
  ctx.lineTo(cx + s * 0.45, by + s * 0.12);
  ctx.closePath();
  ctx.fill();
  // BLACK CAP — covers top of head through eye-level, matches perched
  ctx.fillStyle = C.cap;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, by - s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.58, by - s * 0.25, cx - s * 0.32, by - s * 0.28);
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.26, cx + s * 0.12, by - s * 0.18);
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.12, cx - s * 0.3, by - s * 0.08);
  ctx.quadraticCurveTo(cx - s * 0.47, by - s * 0.05, cx - s * 0.55, by - s * 0.05);
  ctx.closePath();
  ctx.fill();
  // BLACK BIB — clean small patch, same style as perched
  ctx.fillStyle = C.bib;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.4, by + s * 0.08, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // === NEAR WING (drawn on top of body) — shoulder LOWER & centered on body
  const nShX = cx - s * 0.02;
  const nShY = by + s * 0.02;
  const spanNear = s * 0.65;
  const near = wingTipFromPhase(nShX, nShY, spanNear, flapPhase, true, +1);
  sideWing(nShX, nShY, near.tipX, near.tipY, s * 0.16, C.wing, '#2e2a20');

  // Eye tucked in cap
  ctx.fillStyle = '#000';
  ellipse(cx - s * 0.42, by - s * 0.15, s * 0.028, s * 0.028);
  ctx.fillStyle = '#fff';
  ellipse(cx - s * 0.43, by - s * 0.16, s * 0.009, s * 0.009);
  // Bill — small triangle pointing left
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, by - s * 0.03);
  ctx.lineTo(cx - s * 0.72, by + s * 0.01);
  ctx.lineTo(cx - s * 0.55, by + s * 0.05);
  ctx.closePath();
  ctx.fill();
}

// ===== BARRED OWL =====
const OWL_COLORS = {
  bodyLight: '#ad8f60',
  bodyDark:  '#6a4d2c',
  bars:      '#3a2810',
  belly:     '#d4b886',
  face:      '#e2cca0',
  faceRings: '#7a5a38',
  eye:       '#1a0f08',
  bill:      '#d6a848',
  billShadow:'#8a6820',
  feet:      '#a57f4a',
};

function drawBarredOwlPerched(cx, cy, s) {
  const C = OWL_COLORS;
  // branch
  drawPerch(cx, cy + s * 0.92, s * 1.0);
  // feet (feathered, thick)
  stroke([[cx - s * 0.18, cy + s * 0.82], [cx - s * 0.18, cy + s * 0.92]], C.feet, Math.max(4, s * 0.1));
  stroke([[cx + s * 0.15, cy + s * 0.82], [cx + s * 0.15, cy + s * 0.92]], C.feet, Math.max(4, s * 0.1));

  // Unified silhouette — pear/egg shape, no neck, wider at top (head merges into body)
  ctx.fillStyle = C.bodyLight;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.62, cy - s * 0.2);               // upper-left of head
  ctx.quadraticCurveTo(cx - s * 0.7, cy - s * 0.6, cx - s * 0.3, cy - s * 0.75);  // crown left
  ctx.quadraticCurveTo(cx, cy - s * 0.85, cx + s * 0.3, cy - s * 0.75);           // crown top
  ctx.quadraticCurveTo(cx + s * 0.7, cy - s * 0.6, cx + s * 0.62, cy - s * 0.2);  // right side of head
  ctx.quadraticCurveTo(cx + s * 0.6, cy + s * 0.1, cx + s * 0.65, cy + s * 0.4);  // right shoulder into body
  ctx.quadraticCurveTo(cx + s * 0.55, cy + s * 0.85, cx + s * 0.15, cy + s * 0.85); // right bottom
  ctx.quadraticCurveTo(cx, cy + s * 0.9, cx - s * 0.15, cy + s * 0.85);          // bottom center
  ctx.quadraticCurveTo(cx - s * 0.55, cy + s * 0.85, cx - s * 0.65, cy + s * 0.4); // left bottom up
  ctx.quadraticCurveTo(cx - s * 0.6, cy + s * 0.1, cx - s * 0.62, cy - s * 0.2);  // left side back to head
  ctx.closePath();
  ctx.fill();

  // Shading on sides (darker edges)
  ctx.save();
  ctx.clip();
  ctx.fillStyle = C.bodyDark;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.55, cy + s * 0.1, s * 0.18, s * 0.5, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.55, cy + s * 0.1, s * 0.18, s * 0.5, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Facial disc — large pale area, heart-shape
  ctx.fillStyle = C.face;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.22, cy - s * 0.35, s * 0.28, s * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.22, cy - s * 0.35, s * 0.28, s * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dark border around facial disc
  ctx.strokeStyle = C.faceRings;
  ctx.lineWidth = Math.max(1.5, s * 0.022);
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.22, cy - s * 0.35, s * 0.28, s * 0.33, 0, Math.PI * 0.1, Math.PI * 1.95);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.22, cy - s * 0.35, s * 0.28, s * 0.33, 0, -Math.PI * 0.95, Math.PI * 0.9);
  ctx.stroke();

  // Dark forehead V (narrow)
  ctx.fillStyle = C.bodyDark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.04, cy - s * 0.75);
  ctx.quadraticCurveTo(cx, cy - s * 0.5, cx, cy - s * 0.25);
  ctx.quadraticCurveTo(cx, cy - s * 0.5, cx + s * 0.04, cy - s * 0.75);
  ctx.quadraticCurveTo(cx, cy - s * 0.78, cx - s * 0.04, cy - s * 0.75);
  ctx.closePath();
  ctx.fill();

  // Upper breast — horizontal bars
  ctx.strokeStyle = C.bars;
  ctx.lineWidth = Math.max(1.5, s * 0.03);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = cy - s * 0.05 + i * s * 0.1;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, y);
    ctx.quadraticCurveTo(cx, y + s * 0.02, cx + s * 0.45, y);
    ctx.stroke();
  }
  // Lower belly — vertical streaks
  for (let i = 0; i < 8; i++) {
    const xb = cx - s * 0.42 + i * s * 0.12;
    ctx.beginPath();
    ctx.moveTo(xb, cy + s * 0.3);
    ctx.quadraticCurveTo(xb + s * 0.005, cy + s * 0.55, xb - s * 0.01, cy + s * 0.78);
    ctx.stroke();
  }
  ctx.restore();

  // Eyes — BIG dark (barred owl has dark eyes, not yellow)
  ctx.fillStyle = C.eye;
  ellipse(cx - s * 0.22, cy - s * 0.35, s * 0.1, s * 0.11);
  ellipse(cx + s * 0.22, cy - s * 0.35, s * 0.1, s * 0.11);
  // subtle highlights
  ctx.fillStyle = '#fff4d0';
  ellipse(cx - s * 0.19, cy - s * 0.39, s * 0.02, s * 0.02);
  ellipse(cx + s * 0.25, cy - s * 0.39, s * 0.02, s * 0.02);

  // Bill — small yellow-horn triangle nestled between eyes
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.25);
  ctx.quadraticCurveTo(cx - s * 0.04, cy - s * 0.16, cx, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.04, cy - s * 0.16, cx, cy - s * 0.25);
  ctx.closePath();
  ctx.fill();
  // bill shadow below
  ctx.fillStyle = C.billShadow;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.02, cy - s * 0.13);
  ctx.lineTo(cx + s * 0.02, cy - s * 0.13);
  ctx.lineTo(cx, cy - s * 0.08);
  ctx.closePath();
  ctx.fill();
}

// Helper — draw a wing with a proper bird-wing silhouette:
//  - curved leading edge (front of wing)
//  - bulged trailing edge (secondaries)
//  - primary "finger" feathers at the tip
// Tapers from wide at shoulder to narrow at tip.
function sideWing(shoulderX, shoulderY, tipX, tipY, halfWidth, color, dark, _bars) {
  const dx = tipX - shoulderX;
  const dy = tipY - shoulderY;
  const len = Math.hypot(dx, dy) || 1;
  const ax = dx / len, ay = dy / len;     // wing axis unit vector
  // Perpendicular toward trailing edge (below/behind for a wing pointing up-right on a
  // left-facing bird). Trailing is the convex, bulged side.
  const tnx = -ay, tny = ax;
  // Leading perpendicular (concave, slight forward curve)
  const lnx = ay, lny = -ax;

  const rootLead  = halfWidth * 0.35;   // shoulder thickness toward leading side
  const rootTrail = halfWidth * 0.35;   // shoulder thickness toward trailing side
  const midTrailBulge = halfWidth * 1.25; // secondaries bulge
  const midLeadCurve  = halfWidth * 0.15; // gentle curve on leading edge
  const tipThickness  = halfWidth * 0.08;

  // Key points on outline
  const p_shLead  = [shoulderX + lnx * rootLead,  shoulderY + lny * rootLead];
  const p_shTrail = [shoulderX + tnx * rootTrail, shoulderY + tny * rootTrail];
  const p_tip     = [tipX, tipY];
  const p_ctrlLead  = [shoulderX + ax * len * 0.4 + lnx * midLeadCurve,
                       shoulderY + ay * len * 0.4 + lny * midLeadCurve];
  const p_ctrlTrail = [shoulderX + ax * len * 0.45 + tnx * midTrailBulge,
                       shoulderY + ay * len * 0.45 + tny * midTrailBulge];
  const p_trailNearTip = [shoulderX + ax * len * 0.82 + tnx * halfWidth * 0.35,
                          shoulderY + ay * len * 0.82 + tny * halfWidth * 0.35];

  // Main wing fill
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p_shLead[0], p_shLead[1]);
  ctx.quadraticCurveTo(p_ctrlLead[0], p_ctrlLead[1], p_tip[0], p_tip[1]);
  ctx.quadraticCurveTo(p_trailNearTip[0], p_trailNearTip[1], p_ctrlTrail[0], p_ctrlTrail[1]);
  ctx.quadraticCurveTo(
    shoulderX + ax * len * 0.15 + tnx * halfWidth * 0.45,
    shoulderY + ay * len * 0.15 + tny * halfWidth * 0.45,
    p_shTrail[0], p_shTrail[1]
  );
  ctx.closePath();
  ctx.fill();

  // Primary "finger" feathers at the tip — 4 separate tapered shapes
  ctx.fillStyle = dark;
  const fingers = 4;
  for (let i = 0; i < fingers; i++) {
    const baseT = 0.68 + i * 0.06;          // where along wing axis the feather attaches
    const spreadLat = (i - (fingers - 1) / 2); // -1.5, -0.5, 0.5, 1.5
    const tipT = 0.94 + i * 0.015;
    const tipLat = spreadLat * halfWidth * 0.35;

    const baseInner = [
      shoulderX + ax * len * baseT + tnx * halfWidth * 0.2,
      shoulderY + ay * len * baseT + tny * halfWidth * 0.2,
    ];
    const baseOuter = [
      shoulderX + ax * len * baseT + tnx * halfWidth * 0.55,
      shoulderY + ay * len * baseT + tny * halfWidth * 0.55,
    ];
    const fTip = [
      shoulderX + ax * len * tipT + tnx * tipLat,
      shoulderY + ay * len * tipT + tny * tipLat,
    ];
    ctx.beginPath();
    ctx.moveTo(baseInner[0], baseInner[1]);
    ctx.lineTo(baseOuter[0], baseOuter[1]);
    ctx.quadraticCurveTo(
      fTip[0] + tnx * halfWidth * 0.05,
      fTip[1] + tny * halfWidth * 0.05,
      fTip[0], fTip[1]
    );
    ctx.closePath();
    ctx.fill();
  }

  // Suggest coverts — a shadow line along the trailing secondaries
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, len * 0.015);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX + ax * len * 0.15 + tnx * halfWidth * 0.25,
             shoulderY + ay * len * 0.15 + tny * halfWidth * 0.25);
  ctx.quadraticCurveTo(
    shoulderX + ax * len * 0.45 + tnx * halfWidth * 0.85,
    shoulderY + ay * len * 0.45 + tny * halfWidth * 0.85,
    shoulderX + ax * len * 0.7 + tnx * halfWidth * 0.45,
    shoulderY + ay * len * 0.7 + tny * halfWidth * 0.45
  );
  ctx.stroke();
}

// Given flap phase, compute wing-tip position.
//   xDir = +1 → wing tip extends BACK (toward tail). Default for near wing.
//   xDir = -1 → wing tip extends FORWARD (toward head). Use for far wing to get
//   a horizontal mirror — both wings raised but pointing in opposite directions.
function wingTipFromPhase(shoulderX, shoulderY, span, phase, isNear, xDir = 1) {
  const angDeg = -10 + phase * 95;
  const ang = angDeg * Math.PI / 180;
  const scale = isNear ? 1 : 0.85;
  return {
    tipX: shoulderX + xDir * Math.cos(ang) * span * scale,
    tipY: shoulderY - Math.sin(ang) * span * scale,
  };
}

function drawBarredOwlFlying(cx, cy, s, flapPhase = 0.65) {
  const C = OWL_COLORS;
  const by = cy + (flapPhase - 0.5) * s * 0.06;

  // === FAR WING first — UP-FORWARD (mirror left-right of near wing); shared
  // shoulder low on body ===
  const shX_owl = cx + s * 0.0;
  const shY_owl = by + s * 0.05;
  const spanFar = s * 0.85;
  const far = wingTipFromPhase(shX_owl, shY_owl, spanFar, flapPhase, false, -1);
  sideWing(shX_owl, shY_owl, far.tipX, far.tipY, s * 0.24, C.bodyDark, '#2a1e0a');

  // Fanned tail (drawn first so body overlays)
  ctx.fillStyle = C.bodyLight;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.4, by - s * 0.05);
  ctx.lineTo(cx + s * 0.85, by - s * 0.0);
  ctx.quadraticCurveTo(cx + s * 0.9, by + s * 0.15, cx + s * 0.85, by + s * 0.25);
  ctx.lineTo(cx + s * 0.4, by + s * 0.3);
  ctx.closePath();
  ctx.fill();
  // Tail bars
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.4, by - s * 0.05);
  ctx.lineTo(cx + s * 0.85, by - s * 0.0);
  ctx.quadraticCurveTo(cx + s * 0.9, by + s * 0.15, cx + s * 0.85, by + s * 0.25);
  ctx.lineTo(cx + s * 0.4, by + s * 0.3);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = C.bars;
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = by + s * 0.04 + i * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.4, y);
    ctx.lineTo(cx + s * 0.9, y);
    ctx.stroke();
  }
  ctx.restore();

  // Unified body+head silhouette (side profile, facing LEFT)
  ctx.fillStyle = C.bodyLight;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, by - s * 0.02);       // throat/chin (front)
  ctx.quadraticCurveTo(cx - s * 0.58, by - s * 0.3, cx - s * 0.3, by - s * 0.36);  // forehead
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.42, cx + s * 0.15, by - s * 0.32); // crown
  ctx.quadraticCurveTo(cx + s * 0.35, by - s * 0.2, cx + s * 0.42, by - s * 0.02); // back to tail base
  ctx.lineTo(cx + s * 0.42, by + s * 0.3);        // tail base bottom
  ctx.quadraticCurveTo(cx + s * 0.1, by + s * 0.4, cx - s * 0.25, by + s * 0.35);   // belly bottom
  ctx.quadraticCurveTo(cx - s * 0.5, by + s * 0.25, cx - s * 0.55, by - s * 0.02);  // to chin
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Pale belly
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.05, by + s * 0.2, s * 0.35, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Horizontal bars across breast/belly
  ctx.strokeStyle = C.bars;
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const y = by + s * 0.02 + i * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, y);
    ctx.quadraticCurveTo(cx, y + s * 0.015, cx + s * 0.35, y);
    ctx.stroke();
  }
  // Tail bars
  for (let i = 0; i < 3; i++) {
    const yb = by + s * 0.1;
    const y = yb + i * s * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.48, y);
    ctx.lineTo(cx + s * 0.85, y);
    ctx.stroke();
  }
  // Dark back
  ctx.fillStyle = C.bodyDark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.25, by - s * 0.3);
  ctx.quadraticCurveTo(cx + s * 0.1, by - s * 0.32, cx + s * 0.5, by + s * 0.0);
  ctx.lineTo(cx + s * 0.85, by + s * 0.05);
  ctx.lineTo(cx + s * 0.85, by + s * 0.12);
  ctx.quadraticCurveTo(cx + s * 0.3, by - s * 0.18, cx - s * 0.15, by - s * 0.2);
  ctx.closePath();
  ctx.fill();
  // Facial disc (front of head visible as pale crescent)
  ctx.fillStyle = C.face;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.4, by - s * 0.15, s * 0.14, s * 0.2, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // === NEAR WING on top of body — shoulder LOWER & centered ===
  const shX = cx + s * 0.0;
  const shY = by + s * 0.05;
  const spanNear = s * 0.95;
  const near = wingTipFromPhase(shX, shY, spanNear, flapPhase, true, +1);
  sideWing(shX, shY, near.tipX, near.tipY, s * 0.3, C.bodyLight, C.bodyDark);

  // Eye (side-view, only one visible)
  ctx.fillStyle = C.eye;
  ellipse(cx - s * 0.4, by - s * 0.22, s * 0.045, s * 0.05);
  // Bill
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, by - s * 0.08);
  ctx.lineTo(cx - s * 0.62, by - s * 0.04);
  ctx.lineTo(cx - s * 0.52, by + s * 0.0);
  ctx.closePath();
  ctx.fill();
}

// ===== AMERICAN ROBIN =====
const ROBIN_COLORS = {
  headDark: '#1f1c18',
  back:     '#6a5e48',
  wing:     '#4e4635',
  wingEdge: '#9a8868',
  breast:   '#c63820',
  breastHi: '#d65030',
  belly:    '#f0e6cc',
  eyeArc:   '#fafaec',
  throatStripe: '#1f1c18',
  bill:     '#e6c24a',
  billTip:  '#5a4018',
  leg:      '#8e5e32',
};

function drawRobinPerched(cx, cy, s) {
  const C = ROBIN_COLORS;
  // branch
  drawPerch(cx, cy + s * 0.85, s * 0.95);
  // long legs
  stroke([[cx - s * 0.08, cy + s * 0.42], [cx - s * 0.1, cy + s * 0.82]], C.leg, Math.max(2, s * 0.035));
  stroke([[cx + s * 0.13, cy + s * 0.42], [cx + s * 0.12, cy + s * 0.82]], C.leg, Math.max(2, s * 0.035));
  // toes
  for (const [fx, fy] of [[cx - s * 0.1, cy + s * 0.82], [cx + s * 0.12, cy + s * 0.82]]) {
    stroke([[fx, fy], [fx - s * 0.07, fy + s * 0.05]], C.leg, Math.max(1.5, s * 0.025));
    stroke([[fx, fy], [fx + s * 0.07, fy + s * 0.05]], C.leg, Math.max(1.5, s * 0.025));
  }

  // Unified body+head silhouette — upright, head blends into body
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy - s * 0.1);              // throat
  ctx.quadraticCurveTo(cx - s * 0.45, cy - s * 0.35, cx - s * 0.35, cy - s * 0.5);  // forehead
  ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.62, cx + s * 0.1, cy - s * 0.55);   // crown top
  ctx.quadraticCurveTo(cx + s * 0.25, cy - s * 0.45, cx + s * 0.28, cy - s * 0.3);  // back of head
  ctx.quadraticCurveTo(cx + s * 0.4, cy - s * 0.1, cx + s * 0.45, cy + s * 0.2);    // back slope
  ctx.lineTo(cx + s * 0.42, cy + s * 0.45);             // rump
  // tail (medium, squared-off wedge)
  ctx.lineTo(cx + s * 0.45, cy + s * 0.7);
  ctx.lineTo(cx + s * 0.18, cy + s * 0.68);
  ctx.lineTo(cx + s * 0.1, cy + s * 0.45);             // under-tail coverts
  ctx.quadraticCurveTo(cx - s * 0.1, cy + s * 0.5, cx - s * 0.28, cy + s * 0.35);   // belly bottom
  ctx.quadraticCurveTo(cx - s * 0.45, cy + s * 0.1, cx - s * 0.38, cy - s * 0.1);   // breast to throat
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Breast — orange-red, full front (high up to chin, down to belly)
  ctx.fillStyle = C.breast;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.48, cy + s * 0.1, cx - s * 0.3, cy + s * 0.4);
  ctx.quadraticCurveTo(cx - s * 0.1, cy + s * 0.5, cx + s * 0.1, cy + s * 0.45);
  ctx.quadraticCurveTo(cx + s * 0.1, cy + s * 0.15, cx + s * 0.0, cy - s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.22, cx - s * 0.42, cy - s * 0.15);
  ctx.closePath();
  ctx.fill();
  // White lower belly/vent
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.02, cy + s * 0.48, s * 0.2, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dark head — charcoal, blends into back behind
  ctx.fillStyle = C.headDark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.45, cy - s * 0.35, cx - s * 0.35, cy - s * 0.5);
  ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.62, cx + s * 0.1, cy - s * 0.55);
  ctx.quadraticCurveTo(cx + s * 0.25, cy - s * 0.45, cx + s * 0.28, cy - s * 0.3);
  ctx.quadraticCurveTo(cx + s * 0.15, cy - s * 0.18, cx - s * 0.1, cy - s * 0.18);
  ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.16, cx - s * 0.42, cy - s * 0.15);
  ctx.closePath();
  ctx.fill();
  // Wing — dark, folded along back
  ctx.fillStyle = C.wing;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.05, cy - s * 0.15);
  ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.1, cx + s * 0.42, cy + s * 0.2);
  ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.4, cx + s * 0.1, cy + s * 0.35);
  ctx.quadraticCurveTo(cx - s * 0.0, cy + s * 0.15, cx - s * 0.05, cy - s * 0.15);
  ctx.closePath();
  ctx.fill();
  // Very subtle wing feather edging (no random floating lines)
  ctx.strokeStyle = C.wingEdge;
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.05, cy + s * 0.35);
  ctx.quadraticCurveTo(cx + s * 0.25, cy + s * 0.35, cx + s * 0.4, cy + s * 0.22);
  ctx.stroke();
  ctx.restore();

  // White eye arcs (upper + lower)
  ctx.strokeStyle = C.eyeArc;
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.beginPath();
  ctx.arc(cx - s * 0.25, cy - s * 0.38, s * 0.06, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - s * 0.25, cy - s * 0.38, s * 0.06, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // Eye
  ctx.fillStyle = '#000';
  ellipse(cx - s * 0.25, cy - s * 0.38, s * 0.03, s * 0.03);
  ctx.fillStyle = '#fff';
  ellipse(cx - s * 0.26, cy - s * 0.39, s * 0.01, s * 0.01);

  // Bill — yellow with dark tip
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.39, cy - s * 0.33);
  ctx.lineTo(cx - s * 0.58, cy - s * 0.29);
  ctx.lineTo(cx - s * 0.39, cy - s * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.billTip;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.53, cy - s * 0.293);
  ctx.lineTo(cx - s * 0.58, cy - s * 0.29);
  ctx.lineTo(cx - s * 0.53, cy - s * 0.28);
  ctx.closePath();
  ctx.fill();
  // bill mouth line
  ctx.strokeStyle = '#4a3418';
  ctx.lineWidth = Math.max(0.8, s * 0.007);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.39, cy - s * 0.29);
  ctx.lineTo(cx - s * 0.58, cy - s * 0.29);
  ctx.stroke();
}

function drawRobinFlying(cx, cy, s, flapPhase = 0.65) {
  const C = ROBIN_COLORS;
  const by = cy + (flapPhase - 0.5) * s * 0.05;

  // === FAR WING first — UP-FORWARD (mirror of near wing); shared low shoulder ===
  const shX_rob = cx + s * 0.0;
  const shY_rob = by + s * 0.02;
  const spanFar = s * 0.68;
  const far = wingTipFromPhase(shX_rob, shY_rob, spanFar, flapPhase, false, -1);
  sideWing(shX_rob, shY_rob, far.tipX, far.tipY, s * 0.18, '#3e3828', C.headDark);

  // Body+head silhouette
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, by - s * 0.02);
  ctx.quadraticCurveTo(cx - s * 0.55, by - s * 0.22, cx - s * 0.3, by - s * 0.24);
  ctx.quadraticCurveTo(cx - s * 0.08, by - s * 0.22, cx + s * 0.1, by - s * 0.18);
  ctx.quadraticCurveTo(cx + s * 0.3, by - s * 0.14, cx + s * 0.45, by - s * 0.05);
  ctx.lineTo(cx + s * 0.85, by - s * 0.02);
  ctx.lineTo(cx + s * 0.85, by + s * 0.12);
  ctx.lineTo(cx + s * 0.4, by + s * 0.18);
  ctx.quadraticCurveTo(cx + s * 0.05, by + s * 0.22, cx - s * 0.25, by + s * 0.18);
  ctx.quadraticCurveTo(cx - s * 0.45, by + s * 0.12, cx - s * 0.52, by - s * 0.02);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Orange breast
  ctx.fillStyle = C.breast;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, by - s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.5, by + s * 0.15, cx - s * 0.2, by + s * 0.2);
  ctx.quadraticCurveTo(cx + s * 0.1, by + s * 0.2, cx + s * 0.2, by + s * 0.08);
  ctx.quadraticCurveTo(cx + s * 0.05, by - s * 0.05, cx - s * 0.3, by - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.5, by - s * 0.1, cx - s * 0.55, by - s * 0.05);
  ctx.closePath();
  ctx.fill();
  // White vent
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.3, by + s * 0.15, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dark head
  ctx.fillStyle = C.headDark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, by - s * 0.02);
  ctx.quadraticCurveTo(cx - s * 0.55, by - s * 0.22, cx - s * 0.3, by - s * 0.24);
  ctx.quadraticCurveTo(cx - s * 0.08, by - s * 0.22, cx + s * 0.1, by - s * 0.18);
  ctx.quadraticCurveTo(cx - s * 0.08, by - s * 0.12, cx - s * 0.3, by - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.47, by - s * 0.08, cx - s * 0.52, by - s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // === NEAR WING on top of body — shoulder LOWER & centered ===
  const shX = cx + s * 0.0;
  const shY = by + s * 0.02;
  const spanNear = s * 0.78;
  const near = wingTipFromPhase(shX, shY, spanNear, flapPhase, true, +1);
  sideWing(shX, shY, near.tipX, near.tipY, s * 0.22, C.wing, C.headDark);

  // Eye arcs
  ctx.strokeStyle = C.eyeArc;
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  ctx.arc(cx - s * 0.4, by - s * 0.14, s * 0.04, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - s * 0.4, by - s * 0.14, s * 0.04, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ellipse(cx - s * 0.4, by - s * 0.14, s * 0.022, s * 0.022);
  // Bill
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.54, by - s * 0.08);
  ctx.lineTo(cx - s * 0.7, by - s * 0.04);
  ctx.lineTo(cx - s * 0.54, by + s * 0.0);
  ctx.closePath();
  ctx.fill();
}

// ===== WOOD DUCK (male) =====
const DUCK_COLORS = {
  head:     '#1e4a32',   // iridescent dark green
  headDark: '#0e2e1c',   // crest / dark head shadow
  faceLine: '#fbf5e0',   // white chinstrap / face lines
  eye:      '#b82020',   // red eye
  bill:     '#d68850',   // simplified (real one is red/yellow/black)
  billTip:  '#1a1a1a',
  chin:     '#fbf5e0',
  breast:   '#6e2e1c',   // chestnut
  breastSpots: '#fdfbf0',
  flank:    '#c8a468',   // buffy sides
  flankBar: '#1a1a1a',   // black bar between breast/flank
  back:     '#2a2f1a',   // dark back
  belly:    '#f0e4c8',
  wing:     '#2e3522',
  wingIrid: '#4a5a8a',   // blue speculum
  leg:      '#d6a060',
};

function drawWoodDuckPerched(cx, cy, s) {
  const C = DUCK_COLORS;
  // branch
  drawPerch(cx, cy + s * 0.55, s * 0.9);
  // short yellow legs
  stroke([[cx - s * 0.15, cy + s * 0.42], [cx - s * 0.17, cy + s * 0.55]], C.leg, Math.max(3, s * 0.05));
  stroke([[cx + s * 0.15, cy + s * 0.42], [cx + s * 0.13, cy + s * 0.55]], C.leg, Math.max(3, s * 0.05));
  // webbed toes
  stroke([[cx - s * 0.17, cy + s * 0.55], [cx - s * 0.24, cy + s * 0.58]], C.leg, Math.max(2, s * 0.04));
  stroke([[cx - s * 0.17, cy + s * 0.55], [cx - s * 0.1, cy + s * 0.58]], C.leg, Math.max(2, s * 0.04));
  stroke([[cx + s * 0.13, cy + s * 0.55], [cx + s * 0.06, cy + s * 0.58]], C.leg, Math.max(2, s * 0.04));
  stroke([[cx + s * 0.13, cy + s * 0.55], [cx + s * 0.2, cy + s * 0.58]], C.leg, Math.max(2, s * 0.04));

  // Body — elongated oval (ducks are longer-bodied than songbirds)
  ctx.fillStyle = C.flank;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.38, cy + s * 0.0);
  ctx.quadraticCurveTo(cx - s * 0.4, cy - s * 0.28, cx - s * 0.2, cy - s * 0.3);  // upper breast curve
  ctx.quadraticCurveTo(cx + s * 0.1, cy - s * 0.34, cx + s * 0.35, cy - s * 0.24); // back
  ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.12, cx + s * 0.62, cy + s * 0.0);  // rear back
  // long tail curving up slightly
  ctx.lineTo(cx + s * 0.88, cy + s * 0.05);
  ctx.lineTo(cx + s * 0.85, cy + s * 0.2);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.28);   // rump under
  ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.42, cx + s * 0.0, cy + s * 0.42);  // belly
  ctx.quadraticCurveTo(cx - s * 0.35, cy + s * 0.35, cx - s * 0.38, cy + s * 0.0); // breast under
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // White belly
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.15, cy + s * 0.35, s * 0.35, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chestnut breast
  ctx.fillStyle = C.breast;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.3, cy + s * 0.0, s * 0.2, s * 0.25, 0.0, 0, Math.PI * 2);
  ctx.fill();
  // Breast white spots
  ctx.fillStyle = C.breastSpots;
  for (let i = 0; i < 8; i++) {
    const sx = cx - s * 0.4 + (i % 3) * s * 0.08 + (Math.floor(i / 3) % 2) * s * 0.04;
    const sy = cy - s * 0.12 + Math.floor(i / 3) * s * 0.08;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s * 0.018, s * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dark back
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.3);
  ctx.quadraticCurveTo(cx + s * 0.1, cy - s * 0.34, cx + s * 0.35, cy - s * 0.24);
  ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.12, cx + s * 0.62, cy + s * 0.0);
  ctx.lineTo(cx + s * 0.88, cy + s * 0.05);
  ctx.lineTo(cx + s * 0.85, cy + s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.4, cy - s * 0.08, cx + s * 0.0, cy - s * 0.2);
  ctx.quadraticCurveTo(cx - s * 0.18, cy - s * 0.24, cx - s * 0.2, cy - s * 0.3);
  ctx.closePath();
  ctx.fill();
  // Folded wing (dark)
  ctx.fillStyle = C.wing;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.0, cy - s * 0.22);
  ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.18, cx + s * 0.5, cy - s * 0.02);
  ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.15, cx + s * 0.05, cy + s * 0.08);
  ctx.quadraticCurveTo(cx - s * 0.02, cy - s * 0.08, cx + s * 0.0, cy - s * 0.22);
  ctx.closePath();
  ctx.fill();
  // Iridescent blue speculum hint
  ctx.fillStyle = C.wingIrid;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.3, cy - s * 0.02, s * 0.1, s * 0.05, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Black bar between breast and flank
  ctx.strokeStyle = C.flankBar;
  ctx.lineWidth = Math.max(2, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy + s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.15, cy + s * 0.0, cx - s * 0.12, cy - s * 0.15);
  ctx.stroke();
  ctx.restore();

  // HEAD — distinctive boxy shape with flowing crest
  // Main head shape — goes from forehead back through long crest
  ctx.fillStyle = C.head;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy - s * 0.15);        // bill junction
  ctx.quadraticCurveTo(cx - s * 0.62, cy - s * 0.38, cx - s * 0.5, cy - s * 0.5);  // forehead
  ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.58, cx - s * 0.1, cy - s * 0.5);   // crown
  // long crest sweeping back
  ctx.quadraticCurveTo(cx + s * 0.05, cy - s * 0.45, cx + s * 0.08, cy - s * 0.3);  // crest tip
  ctx.quadraticCurveTo(cx + s * 0.0, cy - s * 0.28, cx - s * 0.15, cy - s * 0.25);  // under crest
  ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.22, cx - s * 0.42, cy - s * 0.13);  // nape
  ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.08, cx - s * 0.55, cy - s * 0.15);  // close at throat
  ctx.closePath();
  ctx.fill();

  // Darker crest shadow
  ctx.fillStyle = C.headDark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy - s * 0.52);
  ctx.quadraticCurveTo(cx + s * 0.0, cy - s * 0.5, cx + s * 0.08, cy - s * 0.3);
  ctx.quadraticCurveTo(cx + s * 0.0, cy - s * 0.32, cx - s * 0.1, cy - s * 0.4);
  ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.45, cx - s * 0.2, cy - s * 0.52);
  ctx.closePath();
  ctx.fill();

  // White chinstrap (curving from bill base back up to cheek)
  ctx.strokeStyle = C.faceLine;
  ctx.lineWidth = Math.max(2, s * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy - s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.45, cy - s * 0.1, cx - s * 0.35, cy - s * 0.22);
  ctx.stroke();
  // Secondary white line (along eye level)
  ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.35);
  ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.38, cx - s * 0.15, cy - s * 0.35);
  ctx.stroke();

  // Red eye
  ctx.fillStyle = C.eye;
  ellipse(cx - s * 0.35, cy - s * 0.3, s * 0.04, s * 0.035);
  ctx.fillStyle = '#000';
  ellipse(cx - s * 0.35, cy - s * 0.3, s * 0.02, s * 0.018);

  // Bill — thick duck bill (reddish-yellow, pointed toward left)
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy - s * 0.2);
  ctx.quadraticCurveTo(cx - s * 0.82, cy - s * 0.2, cx - s * 0.88, cy - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.82, cy - s * 0.04, cx - s * 0.55, cy - s * 0.1);
  ctx.closePath();
  ctx.fill();
  // Dark bill tip
  ctx.fillStyle = C.billTip;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.82, cy - s * 0.16);
  ctx.quadraticCurveTo(cx - s * 0.9, cy - s * 0.1, cx - s * 0.82, cy - s * 0.06);
  ctx.quadraticCurveTo(cx - s * 0.86, cy - s * 0.1, cx - s * 0.82, cy - s * 0.16);
  ctx.closePath();
  ctx.fill();
  // Bill mouth line
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy - s * 0.14);
  ctx.lineTo(cx - s * 0.82, cy - s * 0.12);
  ctx.stroke();
}

function drawWoodDuckFlying(cx, cy, s, flapPhase = 0.65) {
  const C = DUCK_COLORS;
  const by = cy + (flapPhase - 0.5) * s * 0.05;

  // === FAR WING first — UP-FORWARD, mirror of near wing; shared low shoulder ===
  const shX_duck = cx + s * 0.05;
  const shY_duck = by + s * 0.0;
  const spanFar = s * 0.85;
  const far = wingTipFromPhase(shX_duck, shY_duck, spanFar, flapPhase, false, -1);
  sideWing(shX_duck, shY_duck, far.tipX, far.tipY, s * 0.2, '#1e2212', C.back);

  // Body + head silhouette — long-bodied, streamlined, neck extended
  ctx.fillStyle = C.flank;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.75, by + s * 0.0);                  // bill base
  ctx.quadraticCurveTo(cx - s * 0.72, by - s * 0.18, cx - s * 0.55, by - s * 0.2); // forehead
  ctx.quadraticCurveTo(cx - s * 0.38, by - s * 0.2, cx - s * 0.25, by - s * 0.14); // neck
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.18, cx + s * 0.3, by - s * 0.12); // back
  ctx.lineTo(cx + s * 0.78, by - s * 0.06);                 // tail top
  ctx.lineTo(cx + s * 0.78, by + s * 0.08);                 // tail bottom
  ctx.lineTo(cx + s * 0.3, by + s * 0.16);                  // rump
  ctx.quadraticCurveTo(cx + s * 0.0, by + s * 0.22, cx - s * 0.3, by + s * 0.14);  // belly
  ctx.quadraticCurveTo(cx - s * 0.55, by + s * 0.1, cx - s * 0.65, by + s * 0.05); // neck under
  ctx.quadraticCurveTo(cx - s * 0.72, by + s * 0.03, cx - s * 0.75, by + s * 0.0); // to bill
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // White belly
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.05, by + s * 0.18, s * 0.4, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chestnut breast — LARGER, matching perched
  ctx.fillStyle = C.breast;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.35, by + s * 0.06, s * 0.2, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  // WHITE BREAST SPOTS — diagnostic wood duck feature
  ctx.fillStyle = C.breastSpots;
  for (let i = 0; i < 6; i++) {
    const spotX = cx - s * 0.45 + (i % 3) * s * 0.06 + (Math.floor(i / 3) % 2) * s * 0.03;
    const spotY = by + s * 0.0 + Math.floor(i / 3) * s * 0.05;
    ctx.beginPath();
    ctx.ellipse(spotX, spotY, s * 0.014, s * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // BLACK BAR between breast and flank — diagnostic feature
  ctx.strokeStyle = C.flankBar;
  ctx.lineWidth = Math.max(2, s * 0.022);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, by + s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.17, by + s * 0.05, cx - s * 0.22, by - s * 0.05);
  ctx.stroke();
  // Dark back
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.25, by - s * 0.14);
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.18, cx + s * 0.3, by - s * 0.12);
  ctx.lineTo(cx + s * 0.78, by - s * 0.06);
  ctx.lineTo(cx + s * 0.78, by + s * 0.02);
  ctx.quadraticCurveTo(cx + s * 0.2, by - s * 0.05, cx - s * 0.1, by - s * 0.08);
  ctx.quadraticCurveTo(cx - s * 0.2, by - s * 0.1, cx - s * 0.25, by - s * 0.14);
  ctx.closePath();
  ctx.fill();
  // Green head patch
  ctx.fillStyle = C.head;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.75, by + s * 0.0);
  ctx.quadraticCurveTo(cx - s * 0.72, by - s * 0.18, cx - s * 0.55, by - s * 0.2);
  ctx.quadraticCurveTo(cx - s * 0.38, by - s * 0.2, cx - s * 0.25, by - s * 0.14);
  ctx.quadraticCurveTo(cx - s * 0.35, by - s * 0.05, cx - s * 0.55, by - s * 0.03);
  ctx.quadraticCurveTo(cx - s * 0.7, by + s * 0.0, cx - s * 0.75, by + s * 0.0);
  ctx.closePath();
  ctx.fill();
  // Crest tip darker
  ctx.fillStyle = C.headDark;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.3, by - s * 0.17, s * 0.08, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // White chinstrap line — two lines like perched
  ctx.strokeStyle = C.faceLine;
  ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, by + s * 0.0);
  ctx.quadraticCurveTo(cx - s * 0.55, by - s * 0.05, cx - s * 0.4, by - s * 0.1);
  ctx.stroke();
  // Secondary white face stripe (near eye)
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, by - s * 0.15);
  ctx.quadraticCurveTo(cx - s * 0.5, by - s * 0.17, cx - s * 0.38, by - s * 0.15);
  ctx.stroke();
  ctx.restore();

  // === NEAR WING on top of body — shoulder LOWER & centered ===
  const shX = cx + s * 0.05;
  const shY = by + s * 0.0;
  const spanNear = s * 0.9;
  const near = wingTipFromPhase(shX, shY, spanNear, flapPhase, true, +1);
  sideWing(shX, shY, near.tipX, near.tipY, s * 0.2, C.wing, C.back);
  // Blue speculum hint at base of near wing
  ctx.fillStyle = C.wingIrid;
  ctx.beginPath();
  ctx.ellipse(shX + s * 0.08, shY - s * 0.02, s * 0.08, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // Red eye
  ctx.fillStyle = C.eye;
  ellipse(cx - s * 0.58, by - s * 0.13, s * 0.025, s * 0.025);
  ctx.fillStyle = '#000';
  ellipse(cx - s * 0.58, by - s * 0.13, s * 0.012, s * 0.012);

  // Bill — thicker duck bill with dark tip and mouth line (matches perched)
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.72, by - s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.92, by - s * 0.05, cx - s * 0.97, by + s * 0.02);
  ctx.quadraticCurveTo(cx - s * 0.9, by + s * 0.06, cx - s * 0.72, by + s * 0.03);
  ctx.closePath();
  ctx.fill();
  // Dark bill tip (nail)
  ctx.fillStyle = C.billTip;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.9, by - s * 0.04);
  ctx.quadraticCurveTo(cx - s * 0.98, by + s * 0.01, cx - s * 0.9, by + s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.93, by + s * 0.005, cx - s * 0.9, by - s * 0.04);
  ctx.closePath();
  ctx.fill();
  // Bill mouth line
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = Math.max(1, s * 0.008);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.72, by - s * 0.01);
  ctx.lineTo(cx - s * 0.92, by + s * 0.0);
  ctx.stroke();
}

// ===== NORTHERN MOCKINGBIRD =====
const MOCKER_COLORS = {
  back:     '#8a8478',   // medium gray
  head:     '#6f6a5e',   // slightly darker gray
  belly:    '#e8e0c8',   // pale gray-cream
  wing:     '#3e3a32',   // dark wing
  wingBar:  '#f4ecd8',   // bold white wing bars
  wingPatch:'#fefbea',   // big white patch at base of primaries (visible in flight)
  tailDark: '#3a362e',
  tailWhite:'#f8f2dc',   // white outer tail feathers
  bill:     '#1a1510',
  leg:      '#3a3228',
  eye:      '#000',
  eyeRing:  '#a09070',   // yellowish iris hint
};

function drawMockingbirdPerched(cx, cy, s) {
  const C = MOCKER_COLORS;
  // branch
  drawPerch(cx, cy + s * 0.6, s * 0.85);
  // long thin legs
  stroke([[cx - s * 0.06, cy + s * 0.4], [cx - s * 0.08, cy + s * 0.58]], C.leg, Math.max(2, s * 0.03));
  stroke([[cx + s * 0.12, cy + s * 0.4], [cx + s * 0.1, cy + s * 0.58]], C.leg, Math.max(2, s * 0.03));

  // Body + head silhouette — slender, upright, with LONG TAIL extending down-back
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.15);             // throat
  ctx.quadraticCurveTo(cx - s * 0.48, cy - s * 0.4, cx - s * 0.3, cy - s * 0.5); // forehead
  ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 0.58, cx + s * 0.15, cy - s * 0.5); // crown
  ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.35, cx + s * 0.28, cy - s * 0.1); // back of head
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.05, cx + s * 0.35, cy + s * 0.3); // back to tail
  // Long tail
  ctx.lineTo(cx + s * 0.42, cy + s * 0.92);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.88);
  ctx.lineTo(cx + s * 0.05, cy + s * 0.45);             // under-tail
  ctx.quadraticCurveTo(cx - s * 0.15, cy + s * 0.5, cx - s * 0.3, cy + s * 0.3); // belly bottom
  ctx.quadraticCurveTo(cx - s * 0.45, cy + s * 0.05, cx - s * 0.42, cy - s * 0.15); // breast/throat
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Gray back/head
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.48, cy - s * 0.35);
  ctx.quadraticCurveTo(cx - s * 0.15, cy - s * 0.6, cx + s * 0.15, cy - s * 0.5);
  ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.35, cx + s * 0.28, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.05, cx + s * 0.35, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.08, cy + s * 0.35);
  ctx.quadraticCurveTo(cx + s * 0.0, cy + s * 0.1, cx - s * 0.15, cy - s * 0.05);
  ctx.quadraticCurveTo(cx - s * 0.35, cy - s * 0.15, cx - s * 0.48, cy - s * 0.35);
  ctx.closePath();
  ctx.fill();
  // Darker head
  ctx.fillStyle = C.head;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.2, cy - s * 0.4, s * 0.22, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Folded dark wing with two bold white bars
  ctx.fillStyle = C.wing;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.05, cy - s * 0.2);
  ctx.quadraticCurveTo(cx + s * 0.25, cy - s * 0.12, cx + s * 0.35, cy + s * 0.15);
  ctx.quadraticCurveTo(cx + s * 0.22, cy + s * 0.28, cx + s * 0.05, cy + s * 0.22);
  ctx.quadraticCurveTo(cx - s * 0.08, cy + s * 0.0, cx - s * 0.05, cy - s * 0.2);
  ctx.closePath();
  ctx.fill();
  // Two bold WHITE wing bars
  ctx.strokeStyle = C.wingBar;
  ctx.lineWidth = Math.max(2, s * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.0, cy + s * 0.02);
  ctx.quadraticCurveTo(cx + s * 0.15, cy + s * 0.03, cx + s * 0.3, cy + s * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.0, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.15, cy - s * 0.08, cx + s * 0.3, cy + s * 0.02);
  ctx.stroke();
  // Tail — dark with white outer edge
  ctx.fillStyle = C.tailDark;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.35, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.92);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.88);
  ctx.lineTo(cx + s * 0.18, cy + s * 0.35);
  ctx.closePath();
  ctx.fill();
  // White outer tail edge
  ctx.strokeStyle = C.tailWhite;
  ctx.lineWidth = Math.max(2, s * 0.03);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.16, cy + s * 0.4);
  ctx.lineTo(cx + s * 0.18, cy + s * 0.86);
  ctx.stroke();
  ctx.restore();

  // Dark eye with pale iris hint
  ctx.fillStyle = C.eyeRing;
  ellipse(cx - s * 0.3, cy - s * 0.38, s * 0.04, s * 0.04);
  ctx.fillStyle = C.eye;
  ellipse(cx - s * 0.3, cy - s * 0.38, s * 0.025, s * 0.025);
  // Dark eye-line stripe (subtle)
  ctx.strokeStyle = '#2a2620';
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.44, cy - s * 0.36);
  ctx.lineTo(cx - s * 0.23, cy - s * 0.38);
  ctx.stroke();

  // Bill — thin, slightly decurved, dark
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.43, cy - s * 0.32);
  ctx.quadraticCurveTo(cx - s * 0.6, cy - s * 0.28, cx - s * 0.64, cy - s * 0.23);
  ctx.quadraticCurveTo(cx - s * 0.55, cy - s * 0.24, cx - s * 0.43, cy - s * 0.27);
  ctx.closePath();
  ctx.fill();
}

function drawMockingbirdFlying(cx, cy, s, flapPhase = 0.65) {
  const C = MOCKER_COLORS;
  const by = cy + (flapPhase - 0.5) * s * 0.04;

  // Far wing (UP-FORWARD) — drawn first, body will cover inner half
  const shX_far = cx - s * 0.02;
  const shY_far = by + s * 0.02;
  const farSpan = s * 0.72;
  const far = wingTipFromPhase(shX_far, shY_far, farSpan, flapPhase, false, -1);
  sideWing(shX_far, shY_far, far.tipX, far.tipY, s * 0.18, '#5a554a', C.wing);

  // Body + head silhouette — slender, horizontal with LONG tail
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, by + s * 0.0);
  ctx.quadraticCurveTo(cx - s * 0.55, by - s * 0.2, cx - s * 0.3, by - s * 0.22);
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.22, cx + s * 0.15, by - s * 0.15);
  ctx.lineTo(cx + s * 0.4, by - s * 0.1);
  // Long tail
  ctx.lineTo(cx + s * 0.95, by - s * 0.02);
  ctx.lineTo(cx + s * 0.95, by + s * 0.08);
  ctx.lineTo(cx + s * 0.4, by + s * 0.14);
  ctx.quadraticCurveTo(cx + s * 0.1, by + s * 0.2, cx - s * 0.2, by + s * 0.16);
  ctx.quadraticCurveTo(cx - s * 0.45, by + s * 0.12, cx - s * 0.55, by + s * 0.0);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Gray back
  ctx.fillStyle = C.back;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.3, by - s * 0.22);
  ctx.quadraticCurveTo(cx - s * 0.05, by - s * 0.22, cx + s * 0.15, by - s * 0.15);
  ctx.lineTo(cx + s * 0.95, by - s * 0.02);
  ctx.lineTo(cx + s * 0.95, by + s * 0.04);
  ctx.quadraticCurveTo(cx + s * 0.2, by - s * 0.06, cx - s * 0.1, by - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.25, by - s * 0.16, cx - s * 0.3, by - s * 0.22);
  ctx.closePath();
  ctx.fill();
  // Dark head
  ctx.fillStyle = C.head;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.4, by - s * 0.15, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // WHITE TAIL feathers — outer edge visible as stripe along top/bottom of tail
  ctx.fillStyle = C.tailWhite;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.72, by + s * 0.1, s * 0.22, s * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail dark center
  ctx.fillStyle = C.tailDark;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.4, by - s * 0.08);
  ctx.lineTo(cx + s * 0.95, by - s * 0.0);
  ctx.lineTo(cx + s * 0.95, by + s * 0.05);
  ctx.lineTo(cx + s * 0.4, by + s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Near wing with bold WHITE PATCHES at base (the mockingbird's signature flight mark)
  const shX = cx - s * 0.02;
  const shY = by + s * 0.02;
  const spanNear = s * 0.8;
  const near = wingTipFromPhase(shX, shY, spanNear, flapPhase, true, +1);
  sideWing(shX, shY, near.tipX, near.tipY, s * 0.2, C.wing, '#1a1610');
  // White patch — prominent white flash near shoulder along the wing
  ctx.fillStyle = C.wingPatch;
  const patchMid = [shX + (near.tipX - shX) * 0.3, shY + (near.tipY - shY) * 0.3];
  const dxw = near.tipX - shX, dyw = near.tipY - shY;
  const angW = Math.atan2(dyw, dxw);
  ctx.beginPath();
  ctx.ellipse(patchMid[0], patchMid[1], s * 0.14, s * 0.09, angW, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = C.eyeRing;
  ellipse(cx - s * 0.42, by - s * 0.15, s * 0.03, s * 0.03);
  ctx.fillStyle = C.eye;
  ellipse(cx - s * 0.42, by - s * 0.15, s * 0.018, s * 0.018);

  // Bill — thin, forward-pointing
  ctx.fillStyle = C.bill;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.52, by - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.68, by - s * 0.06, cx - s * 0.72, by - s * 0.02);
  ctx.quadraticCurveTo(cx - s * 0.6, by - s * 0.04, cx - s * 0.52, by - s * 0.07);
  ctx.closePath();
  ctx.fill();
}

// ============== BIRDS TABLE ==============
const birds = [
  { key: 'chickadee', name: 'Black-capped chickadee',
    plant: 'conifer & hazel',
    songLabel: '"fee-bee"',                          callLabel: '"chick-a-dee-dee-dee"',
    drawPerch: drawChickadeePerched, drawFly: drawChickadeeFlying,
    song: songChickadee, call: callChickadee,
    songPeriod: 2600, callPeriod: 1400,
    perchSize: 0.6, flySize: 0.8, flapHz: 3.0 },
  { key: 'owl', name: 'Barred owl',
    plant: 'broadleaf',
    songLabel: '"who-cooks-for-you, who-cooks-for-you-ALL"', callLabel: '"hoo-aww"',
    drawPerch: drawBarredOwlPerched, drawFly: drawBarredOwlFlying,
    song: songBarredOwl, call: callBarredOwl,
    songPeriod: 7000, callPeriod: 2500,
    perchSize: 0.45, flySize: 0.4, flapHz: 1.3 },
  { key: 'robin', name: 'American robin',
    plant: 'dogwood & bramble',
    songLabel: '"cheerily, cheer-up, cheerio"',      callLabel: '"tut-tut-tut"',
    drawPerch: drawRobinPerched, drawFly: drawRobinFlying,
    song: songRobin, call: callRobin,
    songPeriod: 4200, callPeriod: 1600,
    perchSize: 0.55, flySize: 0.75, flapHz: 2.2 },
  { key: 'duck', name: 'Wood duck',
    plant: 'log (tree cavity)',
    songLabel: '"QUACK-quack-quack-quack"',          callLabel: '"quack-quack"',
    drawPerch: drawWoodDuckPerched, drawFly: drawWoodDuckFlying,
    song: songWoodDuck, call: callWoodDuck,
    songPeriod: 3800, callPeriod: 1800,
    perchSize: 0.55, flySize: 0.7, flapHz: 2.8 },
  { key: 'mockingbird', name: 'Northern mockingbird',
    plant: '—',
    songLabel: '—',                                  callLabel: '—',
    drawPerch: drawMockingbirdPerched, drawFly: drawMockingbirdFlying,
    silent: true,
    perchSize: 0.65, flySize: 0.8, flapHz: 2.5 },
];

// Grid layout (2 rows × 3 cols). Cell index → bird key or null (empty).
// Top row: chickadee, owl, mockingbird
// Bottom row: robin, duck, (empty)
const GRID_LAYOUT = ['chickadee', 'owl', 'mockingbird', 'robin', 'duck', null];
function birdForCell(i) {
  const key = GRID_LAYOUT[i];
  return key ? birds.find(b => b.key === key) : null;
}

// ============== SNAPSHOT MODE ==============
if (ONLY_BIRD) {
  const bird = birds.find(b => b.key === ONLY_BIRD);
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#22281f';
  ctx.fillRect(0, 0, W, H);
  if (!bird) {
    ctx.fillStyle = '#f00';
    ctx.font = '24px sans-serif';
    ctx.fillText('Unknown bird: ' + ONLY_BIRD, 20, 40);
  } else {
    ctx.fillStyle = '#e8dcc2';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(bird.name, W / 2, 20);
    ctx.fillStyle = '#7fa075';
    ctx.font = '14px sans-serif';
    ctx.fillText('lives in: ' + bird.plant, W / 2, 58);
    ctx.font = 'italic 15px sans-serif';
    ctx.fillStyle = '#a8b09a';
    ctx.fillText('song ' + bird.songLabel, W / 2, 82);
    ctx.fillText('call ' + bird.callLabel, W / 2, 104);

    const axisY = H * 0.6;
    const flapPhase = 0.72; // nice static pose for snapshot
    if (BIRD_MODE === 'perch') {
      const sz = Math.min(H * 0.58, W * 0.35);
      bird.drawPerch(W / 2, axisY, sz);
      labelUnder(W / 2, H * 0.93, 'perched');
    } else if (BIRD_MODE === 'fly') {
      const sz = Math.min(H * 0.48, W * 0.35);
      bird.drawFly(W / 2, axisY, sz, flapPhase);
      labelUnder(W / 2, H * 0.93, 'flying');
    } else {
      const sz = Math.min(H * 0.5, W * 0.25);
      bird.drawPerch(W * 0.28, axisY, sz);
      labelUnder(W * 0.28, H * 0.94, 'perched');
      bird.drawFly(W * 0.72, axisY - sz * 0.1, sz, flapPhase);
      labelUnder(W * 0.72, H * 0.94, 'flying');
    }
  }
}

function labelUnder(cx, cy, text) {
  ctx.fillStyle = '#8fa082';
  ctx.font = 'italic 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

// ============== INTERACTIVE MODE ==============
if (!ONLY_BIRD) {
  let hoveredIndex = -1;
  let scheduler = null;
  let nextIsCall = false; // alternate between song and call on successive triggers

  function layout() {
    const W = canvas.width, H = canvas.height;
    const qW = W / 3, qH = H / 2;
    return [
      { x: 0,      y: 0,  w: qW, h: qH },  // 0: top-left
      { x: qW,     y: 0,  w: qW, h: qH },  // 1: top-center
      { x: qW * 2, y: 0,  w: qW, h: qH },  // 2: top-right (mockingbird)
      { x: 0,      y: qH, w: qW, h: qH },  // 3: bottom-left
      { x: qW,     y: qH, w: qW, h: qH },  // 4: bottom-center
      { x: qW * 2, y: qH, w: qW, h: qH },  // 5: bottom-right (empty)
    ];
  }

  function quadrantAt(mx, my) {
    const q = layout();
    for (let i = 0; i < q.length; i++) {
      if (mx >= q[i].x && mx < q[i].x + q[i].w && my >= q[i].y && my < q[i].y + q[i].h) return i;
    }
    return -1;
  }

  function triggerVocalization(idx, which) {
    const b = birdForCell(idx);
    if (!b || b.silent) return;
    const ba = getBirdAudio(idx);
    if (which === 'call') b.call(ba);
    else b.song(ba);
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const idx = quadrantAt(e.clientX - rect.left, e.clientY - rect.top);
    if (idx === hoveredIndex) return;

    if (scheduler) { clearTimeout(scheduler); scheduler = null; }
    if (hoveredIndex >= 0) stopBirdAudio(hoveredIndex);

    hoveredIndex = idx;
    nextIsCall = false;
    const b = birdForCell(idx);
    if (b && !b.silent) {
      ensureAudio();
      const tick = () => {
        if (hoveredIndex !== idx) return;
        const which = nextIsCall ? 'call' : 'song';
        triggerVocalization(idx, which);
        const wait = nextIsCall ? b.callPeriod : b.songPeriod;
        nextIsCall = !nextIsCall;
        scheduler = setTimeout(tick, wait);
      };
      tick();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (scheduler) { clearTimeout(scheduler); scheduler = null; }
    if (hoveredIndex >= 0) stopBirdAudio(hoveredIndex);
    hoveredIndex = -1;
  });

  function updateSpectrogram(ba) {
    ba.analyser.getByteFrequencyData(ba.data);
    const sc = ba.sc, sx = ba.scx;
    const w = sc.width, h = sc.height;
    const step = 2;
    const img = sx.getImageData(step, 0, w - step, h);
    sx.putImageData(img, 0, 0);
    sx.fillStyle = '#0a0a14';
    sx.fillRect(w - step, 0, step, h);
    const bins = ba.data.length;
    const maxFreq = audio.sampleRate / 2;
    const showFreq = 6000;
    const binsToShow = Math.floor(showFreq / maxFreq * bins);
    for (let y = 0; y < h; y++) {
      const frac = 1 - y / h;
      const bin = Math.floor(frac * binsToShow);
      const v = ba.data[bin] / 255;
      if (v < 0.02) continue;
      const r = Math.floor(255 * Math.min(1, v * 1.8));
      const g = Math.floor(255 * Math.max(0, Math.min(1, v * 1.6 - 0.45)));
      const b = Math.floor(255 * Math.max(0, 0.5 - Math.abs(v - 0.35)));
      sx.fillStyle = `rgb(${r},${g},${b})`;
      sx.fillRect(w - step, y, step, 1);
    }
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    const now = performance.now() / 1000;

    ctx.fillStyle = '#1a1f1a';
    ctx.fillRect(0, 0, W, H);

    const q = layout();
    for (let i = 0; i < q.length; i++) {
      const { x, y, w, h } = q[i];
      const bird = birdForCell(i);
      const isHovered = i === hoveredIndex;

      // Cell background (dimmer for empty cell)
      if (!bird) {
        ctx.fillStyle = '#151815';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.strokeStyle = '#252a25';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        continue;
      }

      ctx.fillStyle = isHovered ? '#243024' : '#1e231e';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.strokeStyle = isHovered ? '#8fb07a' : '#3a4a3a';
      ctx.lineWidth = isHovered ? 3 : 1;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

      const specHfull = bird.silent ? 0 : Math.min(90, h * 0.18);

      // Only draw spectrogram for vocalizing birds
      if (!bird.silent) {
        const specW = Math.min(450, w * 0.85);
        const specH = specHfull;
        const specX = x + (w - specW) / 2;
        const specY = y + 18;

        if (birdAudio[i]) {
          updateSpectrogram(birdAudio[i]);
          ctx.drawImage(birdAudio[i].sc, specX, specY, specW, specH);
        } else {
          ctx.fillStyle = '#0a0a14';
          ctx.fillRect(specX, specY, specW, specH);
          ctx.fillStyle = '#556';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('hover to hear', specX + specW / 2, specY + specH / 2);
        }
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(specX, specY, specW, specH);
        ctx.fillStyle = '#8a9a8a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('6 kHz', specX + 3, specY + 2);
        ctx.textBaseline = 'bottom';
        ctx.fillText('0 kHz', specX + 3, specY + specH - 2);
      }

      // Flap phase for animation: slow cosine, 0..1
      const flapPhase = 0.5 - 0.5 * Math.cos(now * 2 * Math.PI * bird.flapHz);

      // Two birds side by side: perch | fly
      const availTop = y + 18 + specHfull + (bird.silent ? 0 : 18);
      const availBot = y + h - (bird.silent ? 50 : 80);
      const availH = availBot - availTop;
      const colW = w / 2;
      const perchCX = x + colW * 0.5;
      const flyCX  = x + colW * 1.5;
      const perchSize = Math.min(colW * 0.7, availH * bird.perchSize);
      const flySize   = Math.min(colW * 0.85, availH * bird.flySize);
      const axisY = availTop + availH * 0.65;
      bird.drawPerch(perchCX, axisY, perchSize);
      bird.drawFly(flyCX, availTop + availH * 0.48, flySize, flapPhase);

      ctx.fillStyle = '#6d7a6d';
      ctx.font = 'italic 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const poseLabelY = bird.silent ? y + h - 28 : y + h - 64;
      ctx.fillText('perched', perchCX, poseLabelY);
      ctx.fillText('flying', flyCX, poseLabelY);

      // name + plant (+ song/call for vocalizing birds)
      ctx.fillStyle = '#e8dcc2';
      ctx.font = 'bold 17px sans-serif';
      ctx.textBaseline = 'bottom';
      if (bird.silent) {
        ctx.fillText(bird.name, x + w / 2, y + h - 8);
      } else {
        ctx.fillText(bird.name, x + w / 2, y + h - 46);
        ctx.fillStyle = '#7fa075';
        ctx.font = '12px sans-serif';
        ctx.fillText('lives in ' + bird.plant, x + w / 2, y + h - 30);
        ctx.fillStyle = '#a8b09a';
        ctx.font = 'italic 11px sans-serif';
        ctx.fillText('song ' + bird.songLabel, x + w / 2, y + h - 16);
        ctx.fillText('call ' + bird.callLabel, x + w / 2, y + h - 4);
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
}
