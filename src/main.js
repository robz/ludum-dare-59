const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const VW = 320, VH = 180;
const WW = 320, WH = 730;
const buf = document.createElement('canvas');
buf.width = VW; buf.height = VH;
const bctx = buf.getContext('2d');
bctx.imageSmoothingEnabled = false;

const WALL_Y = 610, WALL_H = 10;
const DOOR_X = 196, DOOR_W = 28;
const VAULT_X = 180; // left edge of vault interior
const VAULT_WALL_T = 10; // wall thickness
const CC_WALL_Y = 200, CC_WALL_H = 10;
const CC_DOOR_X = 196, CC_DOOR_W = 28;
const GRASS_TOP = CC_WALL_Y + CC_WALL_H; // grass starts right under CC wall (no paved courtyard)

const C = {
  grassA: '#4a7a3a', grassB: '#3d6b2f', grassC: '#2f5524', grassD: '#5e8c46',
  dirt: '#6b4a2a', dirtDark: '#4a3018',
  wall: '#6e6e7a', wallDark: '#3f3f49', wallTop: '#9a9aa6', wallTrim: '#54545f',
  floor: '#3a3a44', floorB: '#2c2c34', floorHi: '#484854',
  doorClosed: '#a83232', doorClosedDark: '#621818', doorBolt: '#e8c34a',
  doorOpen: '#1a1a20',
  skinA: '#f0c39a', skinB: '#c9966f', hair: '#3a2316',
  shirt1: '#3b6db5', shirt2: '#b54a3b', shirt3: '#5a8d3b', shirt4: '#8a4ab5',
  pants: '#2b2b3a',
  robot: '#b4b4c0', robotHi: '#dcdce6', robotDark: '#5a5a66',
  robotEye: '#ff5544', robotEyeOn: '#7bff8a',
  signal: '#7be0ff',
  panel: '#2a2a34', panelDark: '#15151c', panelLed: '#ff5544', panelLedOn: '#7bff8a',
  crate: '#7a5836', crateDark: '#523a22',
  rock: '#7a7a86', rockHi: '#a4a4ae', rockDark: '#4a4a56',
  sqBody: '#7a4a26', sqShade: '#4f2e16', sqTail: '#965a30', sqTailHi: '#b07840',
  sqBelly: '#a07050', sqEye: '#ff2222', sqTooth: '#f0e2c0', sqNose: '#1a1a1a',
  drone: '#3a3a44', droneHi: '#6c6c78', droneEye: '#ff4422',
  bullet: '#ffd44a', bulletHi: '#fff4a0',
  beaconPole: '#3a3a44', beaconBulb: '#ff5544', beaconBulbOn: '#7bff8a',
  ccPlaza: '#2a2a30', ccTile: '#3a3a44', ccTileB: '#222228',
  ccWall: '#a0a0a8', ccWallTop: '#c8c8d0', ccWallDark: '#56565e',
  ccSign: '#22467a', ccSignFrame: '#7be0ff', ccSignText: '#ffffff',
  ccDoor: '#222a3a', ccDoorTrim: '#7be0ff',
  asphalt: '#3a3a40', asphaltLn: '#c8c8a8', asphaltCrack: '#1f1f24',
  carRed: '#c84444', carBlue: '#4488c8', carYellow: '#d8b438',
  carHi: '#e8e8ee', carShade: '#1a1a22', carWindow: '#6890b0', carWheel: '#1a1a1a',
  fireOrange: '#ff8c1a', fireYellow: '#ffe060', fireRed: '#c83a18',
  smoke: '#5a5a64', water: '#7be0ff',
};

function makeFollower(opts) {
  return {
    ...opts, step: 0, moving: false,
    speed: 30 + Math.random() * 14,
    followDist: 14 + Math.random() * 10,
    offsetT: Math.random() * 10,
    offsetPeriod: 3 + Math.random() * 4,
    offsetX: 0, offsetY: 0, pauseT: 0,
    hp: 4, maxHp: 4, damageT: 0, downed: false,
    healDelayT: 0, healAccum: 0, fireDmgCD: 0,
    controlled: false,
  };
}

function getControlled() {
  for (const h of [player, ...otherHumans]) {
    if (h.controlled && !h.downed) return h;
  }
  // Promote a new controller from the surviving humans
  const alive = [player, ...otherHumans].filter(h => !h.downed);
  if (alive.length === 0) return null;
  const next = alive[Math.floor(Math.random() * alive.length)];
  for (const h of [player, ...otherHumans]) h.controlled = false;
  next.controlled = true;
  return next;
}

const player = {
  x: 250, y: 680, dir: 'up', step: 0,
  color: C.shirt1, hair: C.hair,
  skin: '#f0c39a', skinDark: '#c9966f',
  hp: 5, maxHp: 5, damageT: 0, downed: false,
  healDelayT: 0, healAccum: 0, fireDmgCD: 0,
  controlled: true,
};
const otherHumans = [
  makeFollower({
    x: 200, y: 678, color: C.shirt2, hair: '#2a1408', dir: 'right',
    skin: '#a87544', skinDark: '#6f4a2a', longHair: true,
  }),
  makeFollower({
    x: 290, y: 698, color: C.shirt3, hair: '#1a0e08', dir: 'left',
    skin: '#5a3818', skinDark: '#3a2410',
  }),
  makeFollower({
    x: 232, y: 720, color: C.shirt4, hair: '#3a1f10', dir: 'up',
    skin: '#d8a878', skinDark: '#9a724a', braids: true,
  }),
];
const robot = {
  x: 256, y: 566, state: 'idle', step: 0, openTimer: 0, eye: 0, idleT: 0,
  fireT: 0, target: null,
};
const panel = { x: 244, y: 658, w: 10, h: 12 };
const beacon = { x: 148, y: 522, w: 10, h: 12 };
const ccPanel = { x: 244, y: 218, w: 10, h: 12 };
const sosPanel = { x: 76, y: 238, w: 10, h: 12 };
const qPanel = { x: 244, y: 158, w: 10, h: 12 };  // east of the fire
const cPanel = { x: 162, y: 158, w: 10, h: 12 };  // west of the fire
const zPanel = { x: 244, y: 92,  w: 10, h: 12 };  // past the fire, just before the narrow path

const fires = [
  { x: 184, y: 118, w: 50, h: 60, out: false, t: Math.random() * 5 },
];

const foods = [];
const sparkles = [];

function spawnSparkles(x, y) {
  for (let i = 0; i < 14; i++) {
    sparkles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 32,
      vy: -20 - Math.random() * 28,
      t: 0, dur: 0.7 + Math.random() * 0.4,
    });
  }
}

function makeSquirrel(x, y, opts) {
  const o = opts || {};
  return {
    x, y, hx: x, hy: y,
    range: o.range ?? Infinity,                  // chase radius from home; Infinity = anywhere
    hp: 3, maxHp: 3, alive: true, dying: 0,
    t: Math.random() * 5, dir: 'down', flashT: 0, lungeT: 0, attackCD: 0,
  };
}
const squirrels = [
  makeSquirrel(210, 360),                          // mid-grass — chases as soon as humans exit
  makeSquirrel(210, 118, { range: 32 }),           // guards CC door — only attacks within 32px
];

const trees = [
  // Grass corridor between vault and gate (sparse)
  { x: 22, y: 470, w: 6, h: 5 },
  { x: 294, y: 472, w: 6, h: 5 },
  { x: 16, y: 380, w: 6, h: 5 },
  { x: 300, y: 378, w: 6, h: 5 },
  { x: 26, y: 290, w: 6, h: 5 },
  { x: 296, y: 285, w: 6, h: 5 },
  { x: 14, y: 200, w: 6, h: 5 },
  { x: 298, y: 195, w: 6, h: 5 },
  { x: 38, y: 130, w: 6, h: 5 },
  { x: 290, y: 130, w: 6, h: 5 },
];

// Forest above the gate — wide entry, path through fire area, narrow path in deep woods
for (let yy = 4; yy < CC_WALL_Y - 4; yy += 13) {
  for (let xx = 6; xx < WW - 6; xx += 13) {
    // Wide entry clearing just past the gate so you can branch sideways
    if (yy > 174 && xx > 130 && xx < 290) continue;
    // C/Q terminal clearings around the fire
    if (xx > 144 && xx < 192 && yy > 142 && yy < 180) continue;
    if (xx > 230 && xx < 280 && yy > 142 && yy < 180) continue;
    // Z terminal clearing (just north of the fire)
    if (xx > 230 && xx < 280 && yy > 76  && yy < 110) continue;
    // Standard wide path between gate and fire (below the fire)
    if (yy >= 100 && xx > 184 && xx < 234) continue;
    // Narrow path north of the fire — only x≈204..220 is open
    if (yy < 100  && xx > 200 && xx < 222) continue;
    const jx = ((xx * 7 + yy * 31) % 5) - 2;
    const jy = ((xx * 31 + yy * 17) % 5) - 2;
    trees.push({ x: xx + jx, y: yy + jy, w: 6, h: 5 });
  }
}

const bullets = [];

const cam = { x: 0, y: WH - VH };
let doorOpen = false;
let ccDoorOpen = false;
let signal = null, signalReceived = false;
let beaconSignal = null, beaconActivated = false;
let ccSignal = null;
let sosSignal = null, sosUsed = false;
let qSignal = null, qUsed = false;
let cSignal = null, cUsed = false;
let zSignal = null, zUsed = false;
let winT = 0;

// Tree-dwelling grenade squirrels in the deep woods
const treeSquirrels = [
  { x: 60,  y: 32, t: Math.random() * 3, throwCD: 1 + Math.random() * 2 },
  { x: 270, y: 50, t: Math.random() * 3, throwCD: 1 + Math.random() * 2 },
  { x: 90,  y: 78, t: Math.random() * 3, throwCD: 1 + Math.random() * 2 },
  { x: 250, y: 16, t: Math.random() * 3, throwCD: 1 + Math.random() * 2 },
];
const grenades = []; // { x, y, vx, vy, targetY, exploded, t, explodeT }
let allSquirrelsCleared = false;
let reachedControlCenter = false;
let humansExited = false;
let prompt = "Stand by the panel and tap the door's Morse code (O = ---)";

const MORSE = { O: '---', S: '...', SOS: '...---...', Q: '--.-', C: '-.-.', Z: '--..' };
const MORSE_DOT_MAX = 0.22;       // hold under this = dot
const MORSE_LETTER_TIMEOUT = 1.2; // pause this long after a mark = evaluate
let morseInput = '';
let morseSilenceT = 0;
let spaceDown = false;
let spaceHeldT = 0;
let morseStatusT = 0;             // > 0 success flash, < 0 error flash
let morseStatusTarget = null;     // 'door' | 'beacon' | null — which cue to flash

const keys = {};
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', e => {
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat && !spaceDown) { spaceDown = true; spaceHeldT = 0; }
      return;
    }
    if (e.key === '1' && !e.repeat) { cheatToGate(); return; }
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', e => {
    if (e.key === ' ') {
      if (spaceDown) {
        spaceDown = false;
        morseInput += spaceHeldT < MORSE_DOT_MAX ? '.' : '-';
        evaluateMorse();
      }
      return;
    }
    keys[e.key.toLowerCase()] = false;
  });
}

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function nearTerminal(t) {
  const ctl = getControlled();
  if (!ctl) return false;
  return dist2(ctl.x, ctl.y, t.x + t.w / 2, t.y + t.h / 2) < 22 * 22;
}
function nearPanel() { return nearTerminal(panel); }
function nearBeacon() { return nearTerminal(beacon); }
function nearCcPanel() { return nearTerminal(ccPanel); }
function nearSosPanel() { return nearTerminal(sosPanel); }
function nearQPanel() { return nearTerminal(qPanel); }
function nearCPanel() { return nearTerminal(cPanel); }
function nearZPanel() { return nearTerminal(zPanel); }

function currentMorseTarget() {
  if (!signalReceived && nearPanel()) return 'door';
  if (doorOpen) {
    const opts = [];
    const ctl = getControlled() || player;
    if (!ccDoorOpen && nearCcPanel()) opts.push({ kind: 'cc_door', d: dist2(ctl.x, ctl.y, ccPanel.x + 5, ccPanel.y + 6) });
    if (nearBeacon()) opts.push({ kind: 'beacon', d: dist2(ctl.x, ctl.y, beacon.x + 5, beacon.y + 6) });
    if (nearSosPanel()) opts.push({ kind: 'sos', d: dist2(ctl.x, ctl.y, sosPanel.x + 5, sosPanel.y + 6) });
    if (nearQPanel()) opts.push({ kind: 'q', d: dist2(ctl.x, ctl.y, qPanel.x + 5, qPanel.y + 6) });
    if (nearCPanel()) opts.push({ kind: 'c', d: dist2(ctl.x, ctl.y, cPanel.x + 5, cPanel.y + 6) });
    if (nearZPanel()) opts.push({ kind: 'z', d: dist2(ctl.x, ctl.y, zPanel.x + 5, zPanel.y + 6) });
    if (opts.length) {
      opts.sort((a, b) => a.d - b.d);
      return opts[0].kind;
    }
  }
  return null;
}

function expectedMorse(target) {
  if (target === 'door') return MORSE.O;
  if (target === 'cc_door') return MORSE.O;
  if (target === 'beacon') return MORSE.S;
  if (target === 'sos') return MORSE.SOS;
  if (target === 'q') return MORSE.Q;
  if (target === 'c') return MORSE.C;
  if (target === 'z') return MORSE.Z;
  return null;
}

function cheatToGate() {
  // Open vault + gate, clear the door-guard squirrel, teleport everyone next to the gate
  doorOpen = true;
  signalReceived = true;
  ccDoorOpen = true;
  humansExited = true;
  for (const s of squirrels) { s.alive = false; s.dying = 0; s.hp = 0; }
  allSquirrelsCleared = true;
  beaconActivated = true;
  for (const f of fires) f.out = true;
  qUsed = true;
  // Clear any in-flight signals
  signal = null; ccSignal = null; beaconSignal = null; sosSignal = null; qSignal = null;
  // Park humans just south of the gate, on the grass side
  const spots = [[210, 122], [196, 130], [224, 130], [210, 138]];
  let i = 0;
  for (const h of [player, ...otherHumans]) {
    if (i >= spots.length) break;
    h.x = spots[i][0]; h.y = spots[i][1]; i++;
  }
  // Robot ends up at the gate too
  robot.state = 'idle';
  robot.x = 240; robot.y = 130;
  // Lightly wound a random human so the cook/heal flow is testable
  const alive = [player, ...otherHumans].filter(h => !h.downed);
  if (alive.length > 0) {
    const victim = alive[Math.floor(Math.random() * alive.length)];
    victim.hp = Math.max(1, victim.hp - 2);
    victim.healDelayT = 5;
    victim.healAccum = 0;
    victim.damageT = 0.3;
  }
  prompt = '[cheat] teleported to the gate';
}

function evaluateMorse() {
  const target = currentMorseTarget();
  const expected = expectedMorse(target);
  if (!expected) {
    morseInput = '';
    morseStatusT = -0.5;
    morseStatusTarget = null;
    return;
  }
  if (morseInput === expected) {
    if (target === 'door' && !signal && !signalReceived) {
      signal = { t: 0 };
      prompt = 'Signal sent — Vault-Bot opening the door';
    } else if (target === 'cc_door' && !ccSignal && !ccDoorOpen) {
      ccSignal = { t: 0 };
      prompt = 'Signal sent — Vault-Bot heading to the gate';
    } else if (target === 'beacon' && !beaconSignal) {
      beaconSignal = { t: 0 };
      prompt = 'SHOOT order sent';
    } else if (target === 'sos' && !sosSignal) {
      sosSignal = { t: 0 };
      prompt = 'SOS sent — Vault-Bot coming to defend you';
    } else if (target === 'q' && !qSignal) {
      qSignal = { t: 0 };
      prompt = 'QUENCH sent — Vault-Bot dispatched to the fire';
    } else if (target === 'c' && !cSignal) {
      cSignal = { t: 0 };
      prompt = 'COOK sent — Vault-Bot is fetching food from the fire';
    } else if (target === 'z' && !zSignal) {
      zSignal = { t: 0 };
      prompt = 'ZOOM sent — Vault-Bot will rush you through the woods';
    }
    morseStatusT = 0.6; morseStatusTarget = target;
    morseInput = '';
    return;
  }
  if (!expected.startsWith(morseInput)) {
    morseInput = '';
    morseStatusT = -0.5;
    morseStatusTarget = target;
  }
}

function squirrelBlocks(x, y) {
  for (const s of squirrels) {
    if (!s.alive) continue;
    const dx = x - s.x, dy = y - (s.y + 1);
    if (dx * dx + dy * dy < 11 * 11) return true;
  }
  return false;
}

function treeBlocks(x, y) {
  for (const r of trees) {
    if (x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 3 && y < r.y + r.h + 3) return true;
  }
  return false;
}

function canWalk(x, y) {
  if (x < 6 || x > WW - 6) return false;
  if (y < 8 || y > WH - 6) return false;
  if (y > CC_WALL_Y - 6 && y < CC_WALL_Y + CC_WALL_H + 5) {
    const inDoor = x > CC_DOOR_X + 7 && x < CC_DOOR_X + CC_DOOR_W - 7;
    if (!(ccDoorOpen && inDoor)) return false;
  }
  // Vault top wall (only spans from west wall to right edge)
  if (y > WALL_Y - 6 && y < WALL_Y + WALL_H + 5 && x > VAULT_X - VAULT_WALL_T - 3) {
    const inDoor = x > DOOR_X + 7 && x < DOOR_X + DOOR_W - 7;
    if (!(doorOpen && inDoor)) return false;
  }
  // Vault west wall (vertical, only below the top wall)
  if (x > VAULT_X - VAULT_WALL_T - 3 && x < VAULT_X + 3 && y > WALL_Y + WALL_H - 5) {
    return false;
  }
  for (const t of [panel, beacon, ccPanel, sosPanel, qPanel, cPanel, zPanel]) {
    if (x > t.x - 4 && x < t.x + t.w + 4 && y > t.y - 2 && y < t.y + t.h + 4) return false;
  }
  for (const f of fires) {
    if (f.out) continue;
    if (x > f.x - 2 && x < f.x + f.w + 2 && y > f.y - 2 && y < f.y + f.h + 2) return false;
  }
  if (treeBlocks(x, y)) return false;
  if (squirrelBlocks(x, y)) return false;
  return true;
}

function update(dt) {
  const ctl = getControlled();
  let mvx = 0, mvy = 0;
  if (ctl) {
    if (keys['w'] || keys['arrowup']) mvy -= 1;
    if (keys['s'] || keys['arrowdown']) mvy += 1;
    if (keys['a'] || keys['arrowleft']) mvx -= 1;
    if (keys['d'] || keys['arrowright']) mvx += 1;
  }
  if (ctl && (mvx || mvy)) {
    const m = Math.hypot(mvx, mvy);
    const sp = 50;
    const nx = ctl.x + mvx / m * sp * dt;
    const ny = ctl.y + mvy / m * sp * dt;
    if (canWalk(nx, ctl.y)) ctl.x = nx;
    if (canWalk(ctl.x, ny)) ctl.y = ny;
    if (Math.abs(mvx) > Math.abs(mvy)) ctl.dir = mvx > 0 ? 'right' : 'left';
    else ctl.dir = mvy > 0 ? 'down' : 'up';
    ctl.step += dt * 8;
  }

  for (const h of [player, ...otherHumans]) {
    if (h === ctl || h.downed) continue;
    updateFollower(h, dt);
  }

  // Morse input timing
  if (spaceDown) spaceHeldT += dt;
  if (morseStatusT > 0) morseStatusT = Math.max(0, morseStatusT - dt);
  else if (morseStatusT < 0) morseStatusT = Math.min(0, morseStatusT + dt);

  cam.x = 0;
  const camFollow = ctl || player;
  const targetY = Math.max(0, Math.min(WH - VH, camFollow.y - VH / 2 + 8));
  cam.y += (targetY - cam.y) * Math.min(1, dt * 6);

  if (signal) {
    signal.t += dt;
    if (signal.t > 0.9) { signal = null; signalReceived = true; robot.state = 'to_door'; }
  }
  if (ccSignal) {
    ccSignal.t += dt;
    if (ccSignal.t > 0.9) { ccSignal = null; robot.state = 'to_cc_door'; }
  }
  if (beaconSignal) {
    beaconSignal.t += dt;
    if (beaconSignal.t > 0.9) {
      beaconSignal = null;
      beaconActivated = true;
      robot.state = 'hunt';
      robot.fireT = 0.4;
    }
  }
  if (sosSignal) {
    sosSignal.t += dt;
    if (sosSignal.t > 0.9) {
      sosSignal = null;
      sosUsed = true;
      robot.state = 'protect';
      robot.fireT = 0.4;
    }
  }
  if (qSignal) {
    qSignal.t += dt;
    if (qSignal.t > 0.9) {
      qSignal = null;
      qUsed = true;
      robot.state = 'quench';
      robot.quenchT = 0;
    }
  }
  if (cSignal) {
    cSignal.t += dt;
    if (cSignal.t > 0.9) {
      cSignal = null;
      cUsed = true;
      robot.state = 'cook';
      robot.cookT = 0;
    }
  }
  if (zSignal) {
    zSignal.t += dt;
    if (zSignal.t > 0.9) {
      zSignal = null;
      zUsed = true;
      robot.state = 'zoom';
      robot.zoomT = 0;
    }
  }
  // Tree squirrels lob grenades onto the narrow path while the woods are active
  for (const ts of treeSquirrels) {
    ts.t += dt;
    if (ccDoorOpen) {
      ts.throwCD -= dt;
      if (ts.throwCD <= 0 && robot.state !== 'zoom') {
        const targetX = 211 + (Math.random() - 0.5) * 8;
        const targetY = 30 + Math.random() * 80;
        const dx = targetX - ts.x;
        grenades.push({
          x: ts.x, y: ts.y,
          vx: dx * 0.6,
          vy: -32,
          targetY, exploded: false, t: 0, explodeT: 0,
          src: ts,
        });
        ts.throwCD = 2.5 + Math.random() * 2.5;
      }
    }
  }
  // Grenades — arc through the air, explode when they reach target Y
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt;
    if (!g.exploded) {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vy += 90 * dt;
      if (g.y >= g.targetY) {
        g.exploded = true;
        g.explodeT = 0;
        for (const h of [player, ...otherHumans]) {
          if (h.downed) continue;
          if (dist2(h.x, h.y, g.x, g.y) < 14 * 14) {
            h.hp -= 1;
            h.damageT = 0.3;
            if (h.hp <= 0) { h.hp = 0; h.downed = true; }
          }
        }
      }
    } else {
      g.explodeT += dt;
      if (g.explodeT > 0.45) grenades.splice(i, 1);
    }
  }
  for (const f of fires) f.t += dt;

  // Food pickups — heal anyone hurt who touches one
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    f.t += dt;
    let consumed = false;
    for (const h of [player, ...otherHumans]) {
      if (h.downed || h.hp >= h.maxHp) continue;
      if (dist2(h.x, h.y, f.x, f.y) < 9 * 9) {
        h.hp = h.maxHp;
        h.damageT = 0;
        spawnSparkles(h.x, h.y - 4);
        consumed = true;
        break;
      }
    }
    if (consumed) foods.splice(i, 1);
  }
  // Sparkle particles
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const sp = sparkles[i];
    sp.t += dt;
    if (sp.t > sp.dur) { sparkles.splice(i, 1); continue; }
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 70 * dt;       // gentle gravity
  }
  updateVaultBot(dt);

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
    if (b.t > 1.5) { bullets.splice(i, 1); continue; }
    let hit = false;
    for (const s of squirrels) {
      if (!s.alive) continue;
      if (dist2(b.x, b.y, s.x, s.y) < 9 * 9) {
        s.hp -= 1; s.flashT = 0.18; s.lungeT = 0.4;
        if (s.hp <= 0) { s.alive = false; s.dying = 0.7; }
        hit = true; break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  if (!humansExited && doorOpen) {
    for (const h of [player, ...otherHumans]) {
      if (!h.downed && h.y < WALL_Y - 4) { humansExited = true; break; }
    }
  }
  for (const s of squirrels) updateSquirrel(s, dt);

  for (const h of [player, ...otherHumans]) {
    if (h.damageT > 0) h.damageT -= dt;
    if (h.fireDmgCD > 0) h.fireDmgCD -= dt;
    if (h.downed) continue;             // dead stays dead
    // Fire damage — stepping on a burning fire hurts
    for (const f of fires) {
      if (f.out) continue;
      if (h.x > f.x - 2 && h.x < f.x + f.w + 2 && h.y > f.y - 2 && h.y < f.y + f.h + 2
          && (h.fireDmgCD || 0) <= 0) {
        h.hp -= 1;
        h.damageT = 0.3;
        h.healDelayT = 5;
        h.healAccum = 0;
        h.fireDmgCD = 0.8;
        if (h.hp <= 0) { h.hp = 0; h.downed = true; }
        break;
      }
    }
  }
  if (reachedControlCenter) winT += dt;

  if (beaconActivated && !allSquirrelsCleared &&
      squirrels.every(s => s.range !== Infinity || (!s.alive && s.dying <= 0))) {
    allSquirrelsCleared = true;
    if (robot.state === 'hunt') robot.state = 'idle';
  }

  if (!reachedControlCenter && ctl && ctl.x > CC_DOOR_X && ctl.x < CC_DOOR_X + CC_DOOR_W && ctl.y < CC_WALL_Y + 4) {
    reachedControlCenter = true;
    winT = 0;
    prompt = 'C = Cook food to heal, Q = Quench fire';
  }

  if (!signal && !beaconSignal && !reachedControlCenter) {
    if (!signalReceived) {
      prompt = nearPanel()
        ? "Tap SPACE = dot, hold SPACE = dash. Send 'O' (---) to open"
        : "Stand by the panel and tap the door's Morse code (O = ---)";
    } else if (!doorOpen) {
      prompt = 'Vault-Bot is opening the vault door...';
    } else if (!beaconActivated) {
      const refY = (ctl || player).y;
      if (refY < WALL_Y - 4) {
        prompt = nearBeacon()
          ? "Send 'S' (...) to order the SHOOT attack"
          : "Find the beacon — shoot code S (...)";
      } else {
        prompt = 'Walk out the open door';
      }
    } else if (!allSquirrelsCleared) {
      prompt = 'Vault-Bot shooting — SOS calls the bot to you';
    } else if (!ccDoorOpen) {
      prompt = 'Path clear — open the gate (O). SOS calls the bot to you.';
    } else {
      prompt = 'Walk through the open gate';
    }
  }
}

function updateVaultBot(dt) {
  if (robot.state === 'idle') {
    // stand still wherever the last command left us
  } else if (robot.state === 'to_door') {
    const tx = DOOR_X + DOOR_W / 2 + 16, ty = WALL_Y - 12;
    const dx = tx - robot.x, dy = ty - robot.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) { robot.state = 'opening'; robot.openTimer = 0; }
    else { robot.x += dx / d * 32 * dt; robot.y += dy / d * 32 * dt; robot.step += dt * 8; }
  } else if (robot.state === 'opening') {
    robot.openTimer += dt;
    if (robot.openTimer > 1.4) { doorOpen = true; robot.state = 'idle'; }
  } else if (robot.state === 'hunt') {
    let target = null, bd = 1e9;
    for (const s of squirrels) {
      if (!s.alive || s.range !== Infinity) continue; // ignore door-guarding squirrels in shoot mode
      const d = dist2(robot.x, robot.y, s.x, s.y);
      if (d < bd) { bd = d; target = s; }
    }
    if (!target) { robot.state = 'idle'; robot.target = null; return; }
    robot.target = target;
    // Face the target but stay put — robot only shoots, doesn't move
    const dx = target.x - robot.x, dy = target.y - robot.y;
    if (Math.abs(dx) > Math.abs(dy)) robot.dir = dx > 0 ? 'right' : 'left';
    else robot.dir = dy > 0 ? 'down' : 'up';
    robot.fireT -= dt;
    if (robot.fireT <= 0) {
      const sd = Math.sqrt(bd);
      bullets.push({ x: robot.x, y: robot.y, vx: dx / sd * 220, vy: dy / sd * 220, t: 0 });
      robot.fireT = 0.6 + Math.random() * 0.2;
    }
  } else if (robot.state === 'to_cc_door') {
    const tx = CC_DOOR_X + CC_DOOR_W / 2 + 16, ty = CC_WALL_Y + CC_WALL_H + 12;
    const dx = tx - robot.x, dy = ty - robot.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) { robot.state = 'opening_cc'; robot.openTimer = 0; }
    else { robot.x += dx / d * 42 * dt; robot.y += dy / d * 42 * dt; robot.step += dt * 8; }
    if (Math.abs(dx) > Math.abs(dy)) robot.dir = dx > 0 ? 'right' : 'left';
    else robot.dir = dy > 0 ? 'down' : 'up';
  } else if (robot.state === 'opening_cc') {
    robot.openTimer += dt;
    if (robot.openTimer > 1.4) { ccDoorOpen = true; robot.state = 'idle'; }
  } else if (robot.state === 'quench') {
    const fire = fires.find(f => !f.out);
    if (!fire) { robot.state = 'idle'; robot.quenchT = 0; return; }
    const cx = fire.x + fire.w / 2;
    const baseY = fire.y + fire.h + 14;
    // Approach from below until lined up with fire's southern edge
    if (Math.abs(robot.y - baseY) > 1) {
      const dx = cx - robot.x, dy = baseY - robot.y;
      const d = Math.hypot(dx, dy);
      robot.x += dx / d * 44 * dt;
      robot.y += dy / d * 44 * dt;
      robot.step += dt * 7;
      if (Math.abs(dx) > Math.abs(dy)) robot.dir = dx > 0 ? 'right' : 'left';
      else robot.dir = dy > 0 ? 'down' : 'up';
    } else {
      // Pace back and forth in front of the fire while spraying
      robot.quenchT = (robot.quenchT || 0) + dt;
      const range = fire.w / 2 - 2;
      const targetX = cx + Math.sin(robot.quenchT * 2.4) * range;
      const dx = targetX - robot.x;
      if (Math.abs(dx) > 0.2) {
        robot.x += Math.sign(dx) * 32 * dt;
        robot.dir = dx > 0 ? 'right' : 'left';
        robot.step += dt * 7;
      }
      if (robot.quenchT > 3.0) {
        fire.out = true;
        robot.quenchT = 0;
        robot.state = 'idle';
      }
    }
  } else if (robot.state === 'cook') {
    const fire = fires.find(f => !f.out);
    if (!fire) { robot.state = 'idle'; robot.cookT = 0; return; }
    const tx = fire.x + fire.w / 2;
    const ty = fire.y + fire.h + 14;
    const dx = tx - robot.x, dy = ty - robot.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      robot.x += dx / d * 44 * dt;
      robot.y += dy / d * 44 * dt;
      robot.step += dt * 7;
      if (Math.abs(dx) > Math.abs(dy)) robot.dir = dx > 0 ? 'right' : 'left';
      else robot.dir = dy > 0 ? 'down' : 'up';
    } else {
      robot.dir = 'up';
      robot.cookT = (robot.cookT || 0) + dt;
      if (robot.cookT > 2.8) {
        robot.cookT = 0;
        // Drop a plate of food in front of the robot (south, away from the fire)
        foods.push({ x: robot.x, y: robot.y + 8, t: 0 });
        robot.state = 'idle';
      }
    }
  } else if (robot.state === 'zoom') {
    // Phase 1: dash to the player to grab them
    if (robot.zoomT === 0) {
      const ctl = getControlled() || player;
      const dx = ctl.x - robot.x, dy = ctl.y - 4 - robot.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        robot.x += dx / d * 110 * dt;
        robot.y += dy / d * 110 * dt;
        robot.step += dt * 12;
        if (Math.abs(dx) > Math.abs(dy)) robot.dir = dx > 0 ? 'right' : 'left';
        else robot.dir = dy > 0 ? 'down' : 'up';
      } else {
        robot.zoomT = 0.001;          // begin phase 2
      }
    } else {
      // Phase 2: drag everyone north, fast
      robot.zoomT += dt;
      const sp = 140;
      robot.y -= sp * dt;
      robot.dir = 'up';
      robot.step += dt * 12;
      for (const h of [player, ...otherHumans]) {
        if (h.downed) continue;
        h.x = robot.x + (Math.random() - 0.5) * 1.2;
        h.y = robot.y + 6;
        h.dir = 'up';
        h.step += dt * 10;
      }
      // Win when we reach the top
      if (robot.y < 8) {
        robot.y = 8;
        if (!reachedControlCenter) {
          reachedControlCenter = true;
          winT = 0;
          prompt = 'C = Cook food to heal, Q = Quench fire';
        }
        robot.state = 'idle';
        robot.zoomT = 0;
      }
    }
  } else if (robot.state === 'protect') {
    // Trail whoever the player currently controls
    const ctl = getControlled() || player;
    const tx = ctl.x - 14, ty = ctl.y - 4;
    const dx = tx - robot.x, dy = ty - robot.y;
    const d = Math.hypot(dx, dy);
    if (d > 6) {
      const sp = Math.min(70, d * 3);
      robot.x += dx / d * sp * dt;
      robot.y += dy / d * sp * dt;
      robot.step += dt * 6;
      if (Math.abs(dx) > Math.abs(dy)) robot.dir = dx > 0 ? 'right' : 'left';
      else robot.dir = dy > 0 ? 'down' : 'up';
    }
    // Shoot any nearby squirrel
    let target = null, bd = 1e9;
    for (const s of squirrels) {
      if (!s.alive) continue;
      const sd = dist2(robot.x, robot.y, s.x, s.y);
      if (sd < bd && sd < 90 * 90) { bd = sd; target = s; }
    }
    if (target) {
      robot.fireT -= dt;
      if (robot.fireT <= 0) {
        const sd = Math.sqrt(bd);
        const dx2 = target.x - robot.x, dy2 = target.y - robot.y;
        bullets.push({ x: robot.x, y: robot.y, vx: dx2 / sd * 220, vy: dy2 / sd * 220, t: 0 });
        robot.fireT = 0.6 + Math.random() * 0.2;
      }
    }
  }
  robot.eye += dt;
}

function updateFollower(h, dt) {
  if (h.downed) { h.moving = false; return; }
  h.offsetT += dt;
  if (h.offsetT > h.offsetPeriod) {
    h.offsetT = 0;
    h.offsetPeriod = 2.5 + Math.random() * 4;
    const ang = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 14;
    h.offsetX = Math.cos(ang) * r;
    h.offsetY = Math.sin(ang) * r;
    if (Math.random() < 0.25) h.pauseT = 0.3 + Math.random() * 1.2;
  }
  if (h.pauseT > 0) { h.pauseT -= dt; h.moving = false; return; }
  const leader = getControlled();
  if (!leader) { h.moving = false; return; }
  const tx = leader.x + h.offsetX, ty = leader.y + h.offsetY;
  const dx = tx - h.x, dy = ty - h.y;
  const d = Math.hypot(dx, dy);
  if (d < h.followDist) { h.moving = false; return; }
  const step = h.speed * dt;
  const nx = h.x + dx / d * step, ny = h.y + dy / d * step;
  let moved = false;
  if (canWalk(nx, h.y)) { h.x = nx; moved = true; }
  if (canWalk(h.x, ny)) { h.y = ny; moved = true; }
  if (moved) {
    if (Math.abs(dx) > Math.abs(dy)) h.dir = dx > 0 ? 'right' : 'left';
    else h.dir = dy > 0 ? 'down' : 'up';
    h.step += dt * 7; h.moving = true;
  } else {
    h.moving = false;
    if (Math.random() < 0.05) h.offsetT = h.offsetPeriod;
  }
}

function canWalkSquirrel(x, y) {
  if (x < 6 || x > WW - 6) return false;
  if (y < CC_WALL_Y + CC_WALL_H + 6) return false;       // can't enter CC
  if (y > WALL_Y - 6) return false;                       // can't enter vault wall band
  if (treeBlocks(x, y)) return false;
  return true;
}

function updateSquirrel(s, dt) {
  s.t += dt;
  if (s.flashT > 0) s.flashT -= dt;
  if (s.lungeT > 0) s.lungeT -= dt;
  if (s.attackCD > 0) s.attackCD -= dt;
  if (!s.alive) { if (s.dying > 0) s.dying -= dt; return; }

  // Stay idle until any human has actually stepped outside the vault
  if (!humansExited) {
    s.y = s.hy + Math.sin(s.t * 2) * 0.5;
    return;
  }

  // Pick nearest non-downed human
  const humans = [player, ...otherHumans];
  let target = null, td = 1e9;
  for (const h of humans) {
    if (h.downed) continue;
    const d = dist2(h.x, h.y, s.x, s.y);
    if (d < td) { td = d; target = h; }
  }

  if (!target) {
    s.y = s.hy + Math.sin(s.t * 2) * 0.5;
    return;
  }

  const dx = target.x - s.x, dy = target.y - s.y;
  const d = Math.sqrt(td);
  if (Math.abs(dx) > Math.abs(dy)) s.dir = dx > 0 ? 'right' : 'left';
  else s.dir = dy > 0 ? 'down' : 'up';

  // Range check — if target is out of squirrel's chase radius, sit and wait
  const targetFromHome2 = dist2(target.x, target.y, s.hx, s.hy);
  if (targetFromHome2 > s.range * s.range) {
    // Drift back toward home, then bob
    const dxh = s.hx - s.x, dyh = s.hy - s.y;
    const dh = Math.hypot(dxh, dyh);
    if (dh > 1) {
      s.x += dxh / dh * Math.min(dh, 25 * dt);
      s.y += dyh / dh * Math.min(dh, 25 * dt);
    } else {
      s.y = s.hy + Math.sin(s.t * 2) * 0.5;
    }
    return;
  }

  // Bite if in range
  if (d < 13 && s.attackCD <= 0) {
    s.lungeT = 0.55;
    s.attackCD = 1.5;
    target.hp -= 1;
    target.damageT = 0.25;
    target.healDelayT = 5;
    target.healAccum = 0;
    if (target.hp <= 0) { target.hp = 0; target.downed = true; }
    return;
  }

  // Chase, but stay within range of home
  if (d > 11) {
    const sp = 22;
    const nx = s.x + dx / d * sp * dt;
    const ny = s.y + dy / d * sp * dt;
    const nDist2 = (nx - s.hx) * (nx - s.hx) + (ny - s.hy) * (ny - s.hy);
    if (nDist2 <= (s.range + 4) * (s.range + 4)) {
      if (canWalkSquirrel(nx, s.y)) s.x = nx;
      if (canWalkSquirrel(s.x, ny)) s.y = ny;
      if (s.range === Infinity) { s.hx = s.x; s.hy = s.y; }
    }
  }
}

function rect(x, y, w, h, c) { bctx.fillStyle = c; bctx.fillRect(x | 0, y | 0, w, h); }
function pset(x, y, c) { bctx.fillStyle = c; bctx.fillRect(x | 0, y | 0, 1, 1); }

function drawPlaza() {
  // Forest floor above the gate
  rect(0, 0, WW, CC_WALL_Y, C.grassA);
  for (let i = 0; i < 300; i++) {
    const x = (i * 53 + 7) % WW;
    const y = (i * 31) % CC_WALL_Y;
    const k = (i * 7) % 5;
    const c = k < 2 ? C.grassB : k < 4 ? C.grassC : C.grassD;
    rect(x, y, 2, 1, c);
  }
  for (let i = 0; i < 50; i++) {
    const x = (i * 113 + 17) % WW;
    const y = (i * 19) % Math.max(1, CC_WALL_Y - 6);
    pset(x, y, C.grassD);
    pset(x + 1, y - 1, C.grassD);
  }
  // Path through the forest — wide before the fire, narrow after
  for (let y = 0; y < CC_WALL_Y; y++) {
    const cx = 210;
    const halfW = y < 100 ? 8 : 14;
    rect(cx - halfW, y, halfW * 2, 1, C.dirt);
    if (y % 6 === 0) {
      pset(cx - halfW + 1, y, C.dirtDark);
      pset(cx + halfW - 2, y, C.dirtDark);
    }
  }
  // Dirt strip just above the gate (same as below)
  for (let x = 0; x < WW; x += 2) {
    if ((x * 7 % 11) > 4) rect(x, CC_WALL_Y - 2, 1, 2, C.dirt);
  }
  // Gate wall
  rect(0, CC_WALL_Y, WW, CC_WALL_H, C.ccWall);
  rect(0, CC_WALL_Y, WW, 2, C.ccWallTop);
  rect(0, CC_WALL_Y + CC_WALL_H - 1, WW, 1, C.ccWallDark);
  // CC Door — closed by default, opens when robot completes opening_cc
  if (ccDoorOpen) {
    rect(CC_DOOR_X, CC_WALL_Y, CC_DOOR_W, CC_WALL_H, C.ccDoor);
    rect(CC_DOOR_X, CC_WALL_Y, 1, CC_WALL_H, C.ccDoorTrim);
    rect(CC_DOOR_X + CC_DOOR_W - 1, CC_WALL_Y, 1, CC_WALL_H, C.ccDoorTrim);
    rect(CC_DOOR_X + 2, CC_WALL_Y + 4, CC_DOOR_W - 4, 1, C.ccDoorTrim);
  } else {
    let openness = 0;
    if (robot.state === 'opening_cc') openness = Math.min(1, robot.openTimer / 1.4);
    const halfW = CC_DOOR_W / 2;
    const slideL = Math.floor(halfW * openness);
    rect(CC_DOOR_X, CC_WALL_Y, halfW - slideL, CC_WALL_H, C.ccWall);
    rect(CC_DOOR_X + halfW + slideL, CC_WALL_Y, halfW - slideL, CC_WALL_H, C.ccWall);
    rect(CC_DOOR_X, CC_WALL_Y, halfW - slideL, 2, C.ccWallTop);
    rect(CC_DOOR_X + halfW + slideL, CC_WALL_Y, halfW - slideL, 2, C.ccWallTop);
    rect(CC_DOOR_X, CC_WALL_Y + CC_WALL_H - 1, halfW - slideL, 1, C.ccWallDark);
    rect(CC_DOOR_X + halfW + slideL, CC_WALL_Y + CC_WALL_H - 1, halfW - slideL, 1, C.ccWallDark);
    if (openness < 0.4) {
      pset(CC_DOOR_X + halfW - 2, CC_WALL_Y + 4, C.ccDoorTrim);
      pset(CC_DOOR_X + halfW + 1, CC_WALL_Y + 4, C.ccDoorTrim);
    }
    if (slideL > 0) rect(CC_DOOR_X + halfW - slideL, CC_WALL_Y + 1, slideL * 2, CC_WALL_H - 2, C.ccDoor);
  }
  // Paved courtyard
  const py0 = CC_WALL_Y + CC_WALL_H;
  rect(0, py0, WW, GRASS_TOP - py0, C.ccPlaza);
  for (let x = 0; x < WW; x += 16) {
    for (let y = py0; y < GRASS_TOP; y += 16) {
      rect(x, y, 16, 1, C.ccTileB);
      rect(x, y, 1, 16, C.ccTileB);
    }
  }
  // Path stub onto grass
  for (let y = GRASS_TOP - 6; y < GRASS_TOP + 6; y++) {
    rect(186, y, 38, 1, C.dirt);
  }
}

function drawGrass() {
  // Fill grass over full area below courtyard; vault wall + floor will overlay later
  rect(0, GRASS_TOP, WW, WH - GRASS_TOP, C.grassA);
  const grassH = WH - GRASS_TOP;
  for (let i = 0; i < 1100; i++) {
    const x = (i * 53 + 7) % WW;
    const y = GRASS_TOP + ((i * 31) % grassH);
    const k = (i * 7) % 5;
    const c = k < 2 ? C.grassB : k < 4 ? C.grassC : C.grassD;
    rect(x, y, 2, 1, c);
  }
  for (let i = 0; i < 150; i++) {
    const x = (i * 113 + 17) % WW;
    const y = GRASS_TOP + 8 + ((i * 19) % (grassH - 16));
    pset(x, y, C.grassD);
    pset(x + 1, y - 1, C.grassD);
  }
  // Winding dirt path stops at the vault wall
  for (let y = GRASS_TOP; y < WALL_Y; y++) {
    const cx = 210 + Math.sin((y - GRASS_TOP) * 0.018) * 22;
    rect(cx - 14, y, 28, 1, C.dirt);
    if (y % 8 === 0) {
      pset(cx - 13, y, C.dirtDark);
      pset(cx + 12, y, C.dirtDark);
    }
  }
  // Dirt strip just above the wall (only spans where wall exists)
  for (let x = VAULT_X - VAULT_WALL_T; x < WW; x += 2) {
    if ((x * 7 % 11) > 4) rect(x, WALL_Y - 2, 1, 2, C.dirt);
  }
}

function drawVaultWall() {
  const wx0 = VAULT_X - VAULT_WALL_T;       // wall start x (west edge of wall)
  const ww = WW - wx0;                       // top wall width
  // Top horizontal wall
  rect(wx0, WALL_Y, ww, WALL_H, C.wall);
  rect(wx0, WALL_Y, ww, 2, C.wallTop);
  rect(wx0, WALL_Y + WALL_H - 1, ww, 1, C.wallDark);
  for (let x = wx0 + 6; x < WW; x += 14) {
    if (x > DOOR_X - 8 && x < DOOR_X + DOOR_W + 4) continue;
    rect(x, WALL_Y + 4, 2, 2, C.wallTrim);
    pset(x, WALL_Y + 4, C.wallDark);
  }
  // West vertical wall
  const vy0 = WALL_Y + WALL_H;
  const vh = WH - vy0;
  rect(wx0, vy0, VAULT_WALL_T, vh, C.wall);
  rect(wx0, vy0, 1, vh, C.wallTop);
  rect(wx0 + VAULT_WALL_T - 1, vy0, 1, vh, C.wallDark);
  for (let y = vy0 + 8; y < WH; y += 14) {
    rect(wx0 + 4, y, 2, 2, C.wallTrim);
    pset(wx0 + 4, y, C.wallDark);
  }
  // Door
  rect(DOOR_X - 2, WALL_Y, DOOR_W + 4, WALL_H, C.wallDark);
  if (doorOpen) {
    rect(DOOR_X, WALL_Y, DOOR_W, WALL_H, C.doorOpen);
    rect(DOOR_X, WALL_Y + WALL_H - 1, DOOR_W, 1, C.doorClosed);
  } else {
    let openness = 0;
    if (robot.state === 'opening') openness = Math.min(1, robot.openTimer / 1.4);
    const halfW = DOOR_W / 2;
    const slideL = Math.floor(halfW * openness);
    rect(DOOR_X, WALL_Y, halfW - slideL, WALL_H, C.doorClosed);
    rect(DOOR_X + halfW + slideL, WALL_Y, halfW - slideL, WALL_H, C.doorClosed);
    rect(DOOR_X, WALL_Y, halfW - slideL, 2, C.doorClosedDark);
    rect(DOOR_X + halfW + slideL, WALL_Y, halfW - slideL, 2, C.doorClosedDark);
    rect(DOOR_X, WALL_Y + WALL_H - 2, halfW - slideL, 2, C.doorClosedDark);
    rect(DOOR_X + halfW + slideL, WALL_Y + WALL_H - 2, halfW - slideL, 2, C.doorClosedDark);
    if (openness < 0.4) {
      pset(DOOR_X + halfW - 3, WALL_Y + 4, C.doorBolt);
      pset(DOOR_X + halfW - 3, WALL_Y + 5, C.doorBolt);
      pset(DOOR_X + halfW + 2, WALL_Y + 4, C.doorBolt);
      pset(DOOR_X + halfW + 2, WALL_Y + 5, C.doorBolt);
    }
    if (slideL > 0) rect(DOOR_X + halfW - slideL, WALL_Y + 1, slideL * 2, WALL_H - 2, C.doorOpen);
  }
}

function drawVaultFloor() {
  const fy = WALL_Y + WALL_H;
  const fw = WW - VAULT_X;
  rect(VAULT_X, fy, fw, WH - fy, C.floor);
  for (let x = VAULT_X; x <= WW; x += 16) rect(x, fy, 1, WH - fy, C.floorB);
  for (let y = fy; y < WH; y += 16) rect(VAULT_X, y, fw, 1, C.floorB);
  for (let x = VAULT_X; x < WW; x += 16) for (let y = fy; y < WH; y += 16) pset(x + 1, y + 1, C.floorHi);
}

function drawCrate(cr) {
  rect(cr.x, cr.y, cr.w, cr.h, C.crate);
  rect(cr.x, cr.y, cr.w, 1, '#9a7044');
  rect(cr.x, cr.y + cr.h - 1, cr.w, 1, C.crateDark);
  rect(cr.x, cr.y, 1, cr.h, C.crateDark);
  rect(cr.x + cr.w - 1, cr.y, 1, cr.h, C.crateDark);
  rect(cr.x + 1, cr.y + Math.floor(cr.h / 2), cr.w - 2, 1, C.crateDark);
}

function drawTree(t) {
  const cx = (t.x + t.w / 2) | 0;
  const baseY = (t.y + t.h) | 0;
  // Ground shadow
  rect(cx - 8, baseY - 1, 16, 2, 'rgba(0,0,0,0.35)');
  rect(cx - 6, baseY + 1, 12, 1, 'rgba(0,0,0,0.25)');
  // Trunk
  const trunkH = 6;
  rect(cx - 2, baseY - trunkH, 4, trunkH, '#5a3a1a');
  rect(cx - 2, baseY - trunkH, 1, trunkH, '#3a2410');
  rect(cx + 1, baseY - trunkH, 1, trunkH, '#7a4e26');
  pset(cx - 1, baseY - 4, '#3a2410');
  // Canopy (rough oval, layered shades)
  const cy = baseY - trunkH;
  // Bottom shadow ring
  rect(cx - 6, cy - 1, 12, 3, '#1f3818');
  // Mid darker green
  rect(cx - 7, cy - 4, 14, 4, C.grassC);
  rect(cx - 8, cy - 3, 16, 2, C.grassC);
  // Upper main green
  rect(cx - 7, cy - 7, 14, 4, C.grassB);
  rect(cx - 5, cy - 9, 10, 2, C.grassB);
  // Top highlight
  rect(cx - 4, cy - 11, 8, 2, C.grassA);
  rect(cx - 2, cy - 12, 4, 1, C.grassD);
  // Brighter highlights
  rect(cx - 4, cy - 8, 3, 1, C.grassD);
  rect(cx - 2, cy - 10, 3, 1, C.grassD);
  pset(cx + 3, cy - 6, C.grassD);
  // Dark dapples
  pset(cx + 5, cy - 2, '#1f3818');
  pset(cx - 5, cy + 0, '#1f3818');
  pset(cx + 2, cy - 5, '#1f3818');
  pset(cx - 6, cy - 5, '#1f3818');
}

function drawGroundFire(f) {
  const x = f.x | 0, y = f.y | 0, w = f.w, h = f.h;
  if (f.out) {
    // Charred, smouldering ground after the fire is quenched
    rect(x, y + 2, w, h - 4, '#3a2a22');
    rect(x + 2, y, w - 4, 2, '#3a2a22');
    rect(x + 2, y + h - 2, w - 4, 2, '#3a2a22');
    for (let i = 0; i < 8; i++) {
      pset(x + 2 + ((i * 17) % (w - 4)), y + 2 + ((i * 31) % (h - 4)), '#1a1410');
    }
    // Faint smoke
    for (let i = 0; i < 3; i++) {
      const sx = x + w / 2 + Math.sin(f.t * 0.7 + i) * 3;
      const sy = y - 4 - ((f.t * 4 + i * 6) % 18);
      bctx.fillStyle = `rgba(120,120,130,${0.3 - i * 0.08})`;
      bctx.fillRect(sx | 0, sy | 0, 2, 2);
    }
    return;
  }
  const t = f.t;
  const cx = x + w / 2, cy = y + h / 2;
  // Charred ground beneath
  rect(x, y + h - 3, w, 3, '#2a1810');
  // Flame columns — denser pack for a thicker blaze
  const cols = 7;
  for (let i = 0; i < cols; i++) {
    const bx = x + 2 + i * Math.floor((w - 4) / cols);
    const flicker = Math.sin(t * 12 + i * 1.3) * 0.5 + 0.5;
    const fh = 14 + Math.floor(flicker * 9);
    rect(bx, y + h - 3 - fh, 4, fh, C.fireRed);
    rect(bx + 1, y + h - 3 - fh + 2, 2, fh - 2, C.fireOrange);
    if (flicker > 0.4) rect(bx + 1, y + h - 3 - fh, 2, 4, C.fireYellow);
    if (flicker > 0.6) pset(bx + 1, y + h - 3 - fh - 1, C.fireYellow);
  }
  // Sparks above
  for (let i = 0; i < 8; i++) {
    const sx = cx + Math.sin(t * 7 + i * 1.7) * (w / 2 - 2);
    const sy = y - 2 - ((t * 18 + i * 4) % 22);
    pset(sx, sy, i % 2 ? C.fireYellow : C.fireOrange);
  }
  // Smoke rising
  for (let i = 0; i < 6; i++) {
    const sx = cx + Math.sin(t * 1.3 + i) * (w / 2);
    const sy = y - 8 - ((t * 12 + i * 6) % 32);
    bctx.fillStyle = `rgba(90,90,100,${0.6 - i * 0.08})`;
    bctx.fillRect(sx | 0, sy | 0, 2, 2);
  }
}

function drawWaterSpray() {
  if (robot.state !== 'quench' || !(robot.quenchT > 0)) return;
  const fire = fires.find(f => !f.out);
  if (!fire) return;
  const sx = robot.x, sy = robot.y - 4;
  const ex = fire.x + fire.w / 2, ey = fire.y + fire.h / 2;
  for (let i = 0; i < 10; i++) {
    const t = (robot.quenchT * 6 + i * 0.13) % 1;
    const px = sx + (ex - sx) * t;
    const py = sy + (ey - sy) * t - Math.sin(t * Math.PI) * 8;
    bctx.fillStyle = i % 2 ? C.water : '#bff0ff';
    bctx.fillRect((px | 0) - 1, py | 0, 2, 1);
  }
}

function drawTerminal(t, lit) {
  rect(t.x - 1, t.y + t.h, t.w + 2, 1, 'rgba(0,0,0,0.35)');
  rect(t.x, t.y, t.w, t.h, C.panelDark);
  rect(t.x + 1, t.y + 1, t.w - 2, t.h - 4, C.panel);
  rect(t.x, t.y + t.h - 2, t.w, 2, C.wallDark);
  rect(t.x + 2, t.y + 3, 2, 2, lit ? C.panelLedOn : C.panelLed);
  rect(t.x + 5, t.y + 3, 3, 1, '#5a5a66');
  rect(t.x + 5, t.y + 5, 3, 1, '#5a5a66');
}

function drawPanel() {
  const lit = signal ? (Math.floor(signal.t * 24) % 2 === 0) : signalReceived;
  drawTerminal(panel, lit);
}

function drawBeacon() {
  const lit = beaconSignal ? (Math.floor(beaconSignal.t * 30) % 2 === 0) : false;
  drawTerminal(beacon, lit);
}

function drawCcPanel() {
  const lit = ccSignal ? (Math.floor(ccSignal.t * 30) % 2 === 0) : ccDoorOpen;
  drawTerminal(ccPanel, lit);
}

function drawSosPanel() {
  const lit = sosSignal ? (Math.floor(sosSignal.t * 30) % 2 === 0) : false;
  drawTerminal(sosPanel, lit);
}

function drawQPanel() {
  const lit = qSignal ? (Math.floor(qSignal.t * 30) % 2 === 0) : false;
  drawTerminal(qPanel, lit);
}

function drawCPanel() {
  const lit = cSignal ? (Math.floor(cSignal.t * 30) % 2 === 0) : false;
  drawTerminal(cPanel, lit);
}

function drawZPanel() {
  const lit = zSignal ? (Math.floor(zSignal.t * 30) % 2 === 0) : false;
  drawTerminal(zPanel, lit);
}

function drawTreeSquirrel(ts) {
  const x = ts.x | 0, y = ts.y | 0;
  // Tree branch perch
  rect(x - 3, y + 4, 8, 1, '#3a2410');
  // Squirrel body
  rect(x - 2, y, 5, 4, C.sqBody);
  rect(x - 2, y, 5, 1, C.sqShade);
  rect(x - 2, y + 3, 5, 1, C.sqShade);
  // Tail curling up
  rect(x + 3, y - 2, 2, 4, C.sqTail);
  pset(x + 3, y - 3, C.sqTail);
  // Eyes
  pset(x - 1, y + 1, C.sqEye);
  pset(x + 1, y + 1, C.sqEye);
  // Ears
  pset(x - 1, y - 1, C.sqBody);
  pset(x + 1, y - 1, C.sqBody);
  // Hold a grenade icon when about to throw
  if (ts.throwCD < 0.4) {
    pset(x, y - 2, '#3a3a44');
    pset(x, y - 3, '#ffd44a');
  }
}

function drawGrenade(g) {
  const x = g.x | 0, y = g.y | 0;
  if (!g.exploded) {
    // bomb body + fuse spark
    rect(x - 2, y - 1, 4, 3, '#1a1a22');
    rect(x - 1, y - 2, 2, 1, '#2a2a30');
    pset(x, y - 3, '#ffd44a');
    pset(x + 1, y - 4, C.fireOrange);
    // shadow on ground at target Y
    rect(x - 2, g.targetY, 5, 1, 'rgba(0,0,0,0.45)');
  } else {
    // expanding burst
    const r = Math.min(14, 4 + g.explodeT * 50);
    bctx.fillStyle = `rgba(255,140,26,${Math.max(0, 1 - g.explodeT / 0.45)})`;
    bctx.fillRect((x - r) | 0, (y - r) | 0, r * 2, r * 2);
    bctx.fillStyle = `rgba(255,255,180,${Math.max(0, 0.8 - g.explodeT / 0.3)})`;
    bctx.fillRect((x - r / 2) | 0, (y - r / 2) | 0, r, r);
  }
}

function drawHuman(h) {
  const x = h.x | 0, y = h.y | 0;
  const skin = h.skin || C.skinA;
  const skinDark = h.skinDark || C.skinB;
  if (h.downed) {
    rect(x - 5, y + 4, 10, 2, 'rgba(0,0,0,0.4)');
    rect(x - 5, y + 2, 10, 3, h.color);          // body lying down
    rect(x - 5, y + 1, 4, 3, skin);               // head
    rect(x - 5, y + 1, 4, 1, h.hair);             // hair
    pset(x - 4, y + 3, '#000'); rect(x - 4, y + 2, 2, 1, '#000'); // X eye
    pset(x - 3, y + 3, '#000');
    return;
  }
  const walking = h.controlled
    ? !!(keys['w'] || keys['a'] || keys['s'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'])
    : !!h.moving;
  const bob = walking ? Math.floor(Math.abs(Math.sin(h.step)) * 1) : 0;
  rect(x - 3, y + 5, 6, 1, 'rgba(0,0,0,0.35)');
  rect(x - 2, y + 3, 1, 2, C.pants);
  rect(x + 1, y + 3, 1, 2, C.pants);
  rect(x - 2, y - bob, 5, 4, h.color);
  rect(x - 2, y + 3 - bob, 1, 1, '#1a1a22');
  rect(x + 2, y + 3 - bob, 1, 1, '#1a1a22');
  const hy = y - 5 - bob;
  // Long-hair drape behind head, sitting on the shoulders/back
  if (h.longHair) {
    if (h.dir === 'up') {
      rect(x - 2, hy + 1, 5, 6, h.hair);
    } else if (h.dir === 'down') {
      rect(x - 3, hy + 3, 1, 4, h.hair);
      rect(x + 3, hy + 3, 1, 4, h.hair);
    } else if (h.dir === 'left') {
      rect(x + 2, hy + 1, 1, 5, h.hair);
    } else {
      rect(x - 3, hy + 1, 1, 5, h.hair);
    }
  }
  // Head
  rect(x - 2, hy, 5, 4, skin);
  rect(x - 2, hy + 3, 5, 1, skinDark);
  if (h.dir === 'down') {
    rect(x - 2, hy, 5, 2, h.hair);
    pset(x - 2, hy + 1, h.hair); pset(x + 2, hy + 1, h.hair);
    pset(x - 1, hy + 2, '#000'); pset(x + 1, hy + 2, '#000');
  } else if (h.dir === 'up') {
    rect(x - 2, hy, 5, 3, h.hair);
  } else if (h.dir === 'left') {
    rect(x - 2, hy, 5, 2, h.hair);
    rect(x - 2, hy + 1, 2, 1, h.hair);
    pset(x - 1, hy + 2, '#000');
  } else if (h.dir === 'right') {
    rect(x - 2, hy, 5, 2, h.hair);
    rect(x + 1, hy + 1, 2, 1, h.hair);
    pset(x + 1, hy + 2, '#000');
  }
  // Braids — one on each side of the head, hanging past the shoulders
  if (h.braids) {
    if (h.dir === 'down' || h.dir === 'up') {
      rect(x - 3, hy + 1, 1, 4, h.hair);
      rect(x + 3, hy + 1, 1, 4, h.hair);
      pset(x - 3, hy + 5, '#ffd44a'); // tie
      pset(x + 3, hy + 5, '#ffd44a');
    } else if (h.dir === 'left') {
      rect(x + 2, hy + 1, 1, 4, h.hair);
      pset(x + 2, hy + 5, '#ffd44a');
    } else {
      rect(x - 3, hy + 1, 1, 4, h.hair);
      pset(x - 3, hy + 5, '#ffd44a');
    }
  }
  // Damage flash overlay
  if (h.damageT > 0) {
    bctx.fillStyle = `rgba(255,80,80,${Math.min(0.7, h.damageT * 3)})`;
    bctx.fillRect(x - 3, hy - 1, 7, 12);
  }
  // Health bar (only if damaged)
  if (h.hp < h.maxHp) drawHealthBar(x, hy - 4, h.hp, h.maxHp, 11);
}

function drawVaultBot() {
  const x = robot.x | 0, y = robot.y | 0;
  const moving = robot.state !== 'opening';
  const bob = moving ? Math.floor(Math.abs(Math.sin(robot.step)) * 1) : 0;
  rect(x - 4, y + 6, 8, 1, 'rgba(0,0,0,0.4)');
  rect(x - 3, y + 4, 2, 2, C.robotDark);
  rect(x + 1, y + 4, 2, 2, C.robotDark);
  rect(x - 4, y - bob, 8, 5, C.robot);
  rect(x - 4, y - bob, 8, 1, C.robotHi);
  rect(x - 4, y + 4 - bob, 8, 1, C.robotDark);
  rect(x - 3, y + 1 - bob, 1, 2, C.robotDark);
  rect(x + 2, y + 1 - bob, 1, 2, C.robotDark);
  const hy = y - 5 - bob;
  rect(x - 3, hy, 6, 4, C.robot);
  rect(x - 3, hy, 6, 1, C.robotHi);
  rect(x - 3, hy + 3, 6, 1, C.robotDark);
  const blink = (Math.floor(robot.eye * 3) % 2) === 0;
  let eyeColor = C.robotEye;
  if (robot.state === 'to_door' || robot.state === 'opening') eyeColor = blink ? C.robotEyeOn : C.robotHi;
  else if (robot.state === 'idle' && doorOpen) eyeColor = C.robotEyeOn;
  rect(x - 2, hy + 1, 4, 1, eyeColor);
  rect(x, y - 8 - bob, 1, 3, C.robotDark);
  pset(x, y - 9 - bob, eyeColor);
  // Cooking pot above the bot's head while cooking
  if (robot.state === 'cook' && (robot.cookT || 0) > 0) {
    const px = x, py = hy - 6;
    rect(px - 4, py + 2, 9, 4, C.robotDark);             // pot body
    rect(px - 4, py + 2, 9, 1, '#9a9aa6');               // rim
    rect(px - 4, py + 5, 9, 1, '#1a1a22');               // base shadow
    rect(px - 5, py + 3, 1, 2, C.robotDark);             // left handle
    rect(px + 5, py + 3, 1, 2, C.robotDark);             // right handle
    // Bubbling food (orange)
    pset(px - 1, py + 3, C.fireOrange);
    pset(px + 2, py + 3, C.fireYellow);
    pset(px,     py + 4, C.fireOrange);
    // Steam puffs
    for (let i = 0; i < 3; i++) {
      const sx = px + Math.sin(robot.cookT * 4 + i * 1.7) * 3;
      const sy = py - 1 - ((robot.cookT * 12 + i * 4) % 8);
      bctx.fillStyle = `rgba(220,220,235,${0.6 - i * 0.18})`;
      bctx.fillRect(sx | 0, sy | 0, 2, 2);
    }
  }
}

function drawFood(f) {
  const x = f.x | 0, y = f.y | 0;
  // Soft shadow
  rect(x - 4, y + 3, 8, 1, 'rgba(0,0,0,0.35)');
  // Plate
  rect(x - 4, y, 8, 3, '#9a7044');
  rect(x - 4, y, 8, 1, '#c89a64');
  rect(x - 4, y + 2, 8, 1, '#5a3818');
  // Food on top (animated)
  const blink = Math.floor(f.t * 6) % 2 === 0;
  pset(x - 1, y, C.fireOrange);
  pset(x,     y, blink ? C.fireYellow : C.fireOrange);
  pset(x + 1, y, C.fireOrange);
  if (blink) pset(x, y - 1, C.fireYellow);
  // Steam
  for (let i = 0; i < 2; i++) {
    const sx = x + Math.sin(f.t * 4 + i * 1.5) * 2;
    const sy = y - 2 - ((f.t * 7 + i * 3) % 6);
    bctx.fillStyle = `rgba(220,220,235,${0.55 - i * 0.18})`;
    bctx.fillRect(sx | 0, sy | 0, 1, 1);
  }
}

function drawSparkles() {
  for (const s of sparkles) {
    const a = Math.max(0, 1 - s.t / s.dur);
    const x = s.x | 0, y = s.y | 0;
    bctx.fillStyle = `rgba(255,240,160,${a})`;
    bctx.fillRect(x, y, 1, 1);
    if (s.t < s.dur * 0.4) {
      bctx.fillStyle = `rgba(255,255,255,${a})`;
      bctx.fillRect(x - 1, y, 1, 1);
      bctx.fillRect(x + 1, y, 1, 1);
      bctx.fillRect(x, y - 1, 1, 1);
      bctx.fillRect(x, y + 1, 1, 1);
    }
  }
}

function drawSquirrel(s) {
  const x = s.x | 0, y = s.y | 0;
  if (!s.alive) {
    if (s.dying > 0) {
      const a = Math.max(0, s.dying / 0.7);
      bctx.globalAlpha = a;
      rect(x - 7, y + 3, 14, 3, C.sqShade);
      rect(x - 6, y + 2, 12, 2, C.sqBody);
      bctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const px = x + Math.cos(i * 1.7 + s.t) * 6;
        const py = y - i * 2 - (1 - a) * 6;
        bctx.fillStyle = `rgba(170,170,180,${a * 0.6})`;
        bctx.fillRect(px | 0, py | 0, 2, 2);
      }
    }
    return;
  }
  const lunge = s.lungeT > 0 ? Math.sin((0.45 - s.lungeT) / 0.45 * Math.PI) * 2 : 0;
  rect(x - 7, y + 6, 14, 1, 'rgba(0,0,0,0.4)');
  // Tail (opposite of facing direction)
  let txx, tyy;
  if (s.dir === 'left')      { txx = x + 4; tyy = y - 4; }
  else if (s.dir === 'right'){ txx = x - 8; tyy = y - 4; }
  else if (s.dir === 'down') { txx = x - 7; tyy = y - 5; }
  else                       { txx = x - 7; tyy = y + 0; }
  rect(txx, tyy, 8, 8, C.sqTail);
  rect(txx + 1, tyy - 2, 6, 2, C.sqTail);
  rect(txx, tyy, 1, 8, C.sqShade);
  rect(txx + 7, tyy, 1, 8, C.sqShade);
  rect(txx + 2, tyy - 2, 4, 1, C.sqTailHi);
  rect(txx + 2, tyy + 1, 4, 1, C.sqTailHi);
  // Body
  rect(x - 6, y - 2 - lunge, 12, 8, C.sqBody);
  rect(x - 6, y + 5 - lunge, 12, 1, C.sqShade);
  rect(x - 6, y - 2 - lunge, 12, 1, C.sqShade);
  rect(x - 4, y + 3 - lunge, 8, 2, C.sqBelly);
  rect(x - 5, y + 5 - lunge, 2, 2, C.sqShade);
  rect(x + 3, y + 5 - lunge, 2, 2, C.sqShade);
  // Head
  let hx = x - 4, hy = y - 6 - lunge;
  if (s.dir === 'left')  hx -= 2;
  if (s.dir === 'right') hx += 2;
  rect(hx, hy, 8, 5, C.sqBody);
  rect(hx, hy, 8, 1, C.sqShade);
  // Ears
  rect(hx, hy - 1, 2, 2, C.sqBody);
  rect(hx + 6, hy - 1, 2, 2, C.sqBody);
  pset(hx + 1, hy - 1, C.sqShade);
  pset(hx + 6, hy - 1, C.sqShade);
  // Eyes
  const flash = s.flashT > 0;
  pset(hx + 1, hy + 2, flash ? '#fff' : C.sqEye);
  pset(hx + 6, hy + 2, flash ? '#fff' : C.sqEye);
  // Nose
  pset(hx + 3, hy + 4, C.sqNose);
  pset(hx + 4, hy + 4, C.sqNose);
  // Vampire fangs — bigger when lunging
  const lunging = s.lungeT > 0.05;
  const fangLen = lunging ? 3 : 2;
  if (lunging) {
    rect(hx + 2, hy + 4, 4, 2, '#3a0808');     // open bloody mouth
    pset(hx + 3, hy + 4, '#a01818');
    pset(hx + 4, hy + 4, '#a01818');
  }
  rect(hx + 2, hy + 5, 1, fangLen, C.sqTooth); // left fang
  rect(hx + 5, hy + 5, 1, fangLen, C.sqTooth); // right fang
  pset(hx + 2, hy + 4 + fangLen, '#a01818');   // blood drip
  pset(hx + 5, hy + 4 + fangLen, '#a01818');
  if (flash) {
    bctx.fillStyle = 'rgba(255,255,255,0.45)';
    bctx.fillRect(x - 8, y - 8, 16, 16);
  }
  // Health bar above head
  if (s.hp < s.maxHp) drawHealthBar(x, hy - 4, s.hp, s.maxHp, 12);
}

function drawHealthBar(cx, topY, hp, maxHp, w) {
  const ww = w || 11;
  const x = (cx - ww / 2) | 0;
  rect(x, topY, ww, 3, '#0e0e14');
  rect(x, topY, ww, 1, '#000');
  const inner = ww - 2;
  const filled = Math.max(0, Math.min(inner, Math.round(inner * hp / maxHp)));
  let color = '#7bff8a';
  if (hp / maxHp <= 0.5) color = '#ffd44a';
  if (hp / maxHp <= 0.25) color = '#ff5544';
  if (filled > 0) rect(x + 1, topY + 1, filled, 1, color);
}

function drawBullet(b) {
  const x = b.x | 0, y = b.y | 0;
  bctx.fillStyle = 'rgba(255,212,74,0.5)';
  bctx.fillRect(x - 2, y - 1, 5, 3);
  bctx.fillStyle = C.bullet;
  bctx.fillRect(x - 1, y, 3, 1);
  bctx.fillRect(x, y - 1, 1, 3);
  pset(x, y, C.bulletHi);
}

const SIGNAL_COLORS = {
  cyan:   { hex: '#7be0ff', rgb: '123,224,255' },  // O — open
  red:    { hex: '#ff5544', rgb: '255,85,68' },    // S — shoot
  sosMix: { hex: '#d38382', rgb: '211,131,130' },  // SOS — (2*S + O)/3
  yellow: { hex: '#ffd444', rgb: '255,212,68' },   // Q — quench
  orange: { hex: '#ff8c1a', rgb: '255,140,26' },   // C — cook
  purple: { hex: '#b86cff', rgb: '184,108,255' },  // Z — zoom
};

function drawArcSignal(srcX, srcY, t, dur, c) {
  const ex = robot.x, ey = robot.y - 9;
  const tn = Math.min(1, t / dur);
  for (let i = 0; i < 6; i++) {
    const tt = Math.max(0, Math.min(1, tn - i * 0.05));
    const px = srcX + (ex - srcX) * tt;
    const py = srcY + (ey - srcY) * tt - Math.sin(tt * Math.PI) * 36;
    const r = i === 0 ? 2 : 1;
    bctx.fillStyle = i === 0 ? c.hex : `rgba(${c.rgb},${(0.7 - i * 0.12).toFixed(2)})`;
    bctx.fillRect((px | 0) - r, py | 0, r * 2 + 1, 1);
    bctx.fillRect(px | 0, (py | 0) - r, 1, r * 2 + 1);
  }
  if (Math.floor(t * 18) % 2 === 0) {
    const rr = 4 + Math.floor(t * 8) % 3;
    bctx.strokeStyle = `rgba(${c.rgb},0.7)`;
    bctx.beginPath(); bctx.arc(srcX + 0.5, srcY + 0.5, rr, 0, Math.PI * 2); bctx.stroke();
  }
}

function drawSignal() {
  if (signal)        drawArcSignal(panel.x + 5, panel.y + 2, signal.t, 0.9, SIGNAL_COLORS.cyan);
  if (ccSignal)      drawArcSignal(ccPanel.x + 5, ccPanel.y + 2, ccSignal.t, 0.9, SIGNAL_COLORS.cyan);
  if (beaconSignal)  drawArcSignal(beacon.x + 5, beacon.y + 2, beaconSignal.t, 0.9, SIGNAL_COLORS.red);
  if (sosSignal)     drawArcSignal(sosPanel.x + 5, sosPanel.y + 2, sosSignal.t, 0.9, SIGNAL_COLORS.sosMix);
  if (qSignal)       drawArcSignal(qPanel.x + 5, qPanel.y + 2, qSignal.t, 0.9, SIGNAL_COLORS.yellow);
  if (cSignal)       drawArcSignal(cPanel.x + 5, cPanel.y + 2, cSignal.t, 0.9, SIGNAL_COLORS.orange);
  if (zSignal)       drawArcSignal(zPanel.x + 5, zPanel.y + 2, zSignal.t, 0.9, SIGNAL_COLORS.purple);
}

function drawHud() {
  bctx.fillStyle = 'rgba(0,0,0,0.7)';
  bctx.fillRect(0, VH - 12, VW, 12);
  bctx.fillStyle = '#000';
  bctx.fillRect(0, VH - 12, VW, 1);
  bctx.fillStyle = '#e8e8f0';
  bctx.font = '7px monospace';
  bctx.textAlign = 'left';
  bctx.textBaseline = 'top';
  bctx.fillText(prompt, 4, VH - 9);
  bctx.textAlign = 'right';
  bctx.fillStyle = '#9a9ab0';
  bctx.fillText('WASD  SPACE', VW - 4, VH - 9);
}

function drawMorseCue(terminal, letter, code, kind) {
  // Adaptive width based on label and code length
  const labelW = letter.length * 6 + 4;
  let codeW = 0;
  for (const ch of code) codeW += (ch === '.' ? 2 : 5);
  codeW += Math.max(0, code.length - 1) * 2;
  const w = Math.max(32, labelW + 4 + codeW + 8);
  const h = 14;
  const cx = terminal.x + Math.floor(terminal.w / 2);
  const x = (cx - w / 2) | 0;
  const y = terminal.y - 6 - h;
  const active = currentMorseTarget() === kind;
  const flashOk = active && morseStatusT > 0 && morseStatusTarget === kind;
  const flashErr = morseStatusT < 0 && morseStatusTarget === kind;
  const bg = active ? '#fffde0' : '#f4f4ec';
  const border = flashErr ? '#ff5544' : flashOk ? '#3aa83a' : active ? '#1a1a22' : '#5a5a66';
  // Bubble body
  rect(x, y, w, h, bg);
  // Borders
  rect(x, y - 1, w, 1, border);
  rect(x, y + h, w, 1, border);
  rect(x - 1, y, 1, h, border);
  rect(x + w, y, 1, h, border);
  // Tail (downward, centered)
  rect(cx - 1, y + h, 3, 1, bg);          // open the bottom border for tail
  pset(cx - 1, y + h + 1, border);
  pset(cx, y + h + 1, bg);
  pset(cx + 1, y + h + 1, border);
  pset(cx, y + h + 2, border);
  // Letter
  bctx.fillStyle = active ? '#1a1a22' : '#5a5a66';
  bctx.font = '7px monospace';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText(letter, x + Math.floor(labelW / 2), y + h / 2);
  // Divider
  const divX = x + labelW;
  rect(divX, y + 2, 1, h - 4, '#9a9aa6');
  // Morse marks
  const fieldX = divX + 1;
  const fieldW = w - labelW - 2;
  let mx = fieldX + Math.floor((fieldW - codeW) / 2);
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const mw = ch === '.' ? 2 : 5;
    const matched = active && i < morseInput.length;
    let color;
    if (flashErr) color = '#ff5544';
    else if (flashOk) color = '#3aa83a';
    else if (matched && morseInput[i] === ch) color = '#3aa83a';
    else if (matched) color = '#ff5544';
    else color = active ? '#1a1a22' : '#7a7a86';
    rect(mx, y + h / 2 - 1, mw, 2, color);
    mx += mw + 2;
  }
  // Hold-progress bar
  if (active && spaceDown) {
    const frac = Math.min(1.5, spaceHeldT / MORSE_DOT_MAX);
    const barW = Math.min(w - 4, Math.floor(frac * (w - 4) / 1.5));
    const barC = spaceHeldT < MORSE_DOT_MAX ? '#3aa83a' : '#7be0ff';
    rect(x + 2, y + h - 3, barW, 1, barC);
  }
}

function drawWinOverlay() {
  if (!reachedControlCenter) return;
  const HOLD = 0.6, FADE = 0.8;
  if (winT > HOLD + FADE) return;
  const a = winT < HOLD ? 1 : Math.max(0, 1 - (winT - HOLD) / FADE);
  bctx.globalAlpha = a;
  bctx.fillStyle = 'rgba(0,0,0,0.7)';
  bctx.fillRect(0, VH / 2 - 10, VW, 20);
  bctx.fillStyle = C.ccDoorTrim;
  bctx.font = '12px monospace';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('THROUGH THE GATE', VW / 2, VH / 2);
  bctx.globalAlpha = 1;
}

function drawGameOverOverlay() {
  const allDead = [player, ...otherHumans].every(h => h.downed);
  if (!allDead) return;
  bctx.fillStyle = 'rgba(0,0,0,0.78)';
  bctx.fillRect(0, VH / 2 - 22, VW, 32);
  bctx.fillStyle = '#ff5544';
  bctx.font = '12px monospace';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('ALL HUMANS DOWN', VW / 2, VH / 2 - 6);
  bctx.font = '7px monospace';
  bctx.fillStyle = '#fff';
  bctx.fillText('refresh to restart', VW / 2, VH / 2 + 6);
}

function drawWorld() {
  drawPlaza();
  drawGrass();
  drawVaultWall();
  drawVaultFloor();
  drawPanel();
  drawBeacon();
  drawCcPanel();
  drawSosPanel();
  drawQPanel();
  drawCPanel();
  drawZPanel();
  // Burnt-out fire remains render below characters (treated as ground decal)
  for (const f of fires) if (f.out) drawGroundFire(f);

  const ents = [];
  for (const h of otherHumans) ents.push({ y: h.y, fn: () => drawHuman(h) });
  ents.push({ y: player.y, fn: () => drawHuman(player) });
  ents.push({ y: robot.y, fn: drawVaultBot });
  for (const s of squirrels) ents.push({ y: s.y, fn: () => drawSquirrel(s) });
  for (const t of trees) ents.push({ y: t.y + t.h, fn: () => drawTree(t) });
  for (const f of fires) if (!f.out) ents.push({ y: f.y + f.h - 4, fn: () => drawGroundFire(f) });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.fn();
  drawWaterSpray();
  for (const ts of treeSquirrels) drawTreeSquirrel(ts);
  for (const g of grenades) drawGrenade(g);
  for (const f of foods) drawFood(f);
  drawSparkles();
  for (const b of bullets) drawBullet(b);
  drawSignal();

  // Morse cue speech bubbles render on top of everything else in the world
  if (!signalReceived) drawMorseCue(panel, 'O', MORSE.O, 'door');
  if (doorOpen) {
    if (!beaconSignal && !beaconActivated) drawMorseCue(beacon, 'S', MORSE.S, 'beacon');
    if (!sosSignal && !sosUsed) drawMorseCue(sosPanel, 'SOS', MORSE.SOS, 'sos');
    if (!ccSignal && !ccDoorOpen) drawMorseCue(ccPanel, 'O', MORSE.O, 'cc_door');
  }
  if (ccDoorOpen) {
    if (!qSignal && !qUsed) drawMorseCue(qPanel, 'Q', MORSE.Q, 'q');
    if (!cSignal && !cUsed) drawMorseCue(cPanel, 'C', MORSE.C, 'c');
    if (qUsed && !zSignal && !zUsed) drawMorseCue(zPanel, 'Z', MORSE.Z, 'z');
  }
}

export function draw(centerx, centery) {
  if (centery !== undefined) cam.y = Math.max(0, Math.min(WH - VH, centery - VH / 2));
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, VW, VH);
  bctx.save();
  bctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  drawWorld();
  bctx.restore();
  drawHud();
  drawWinOverlay();
  drawGameOverOverlay();

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / VW, canvas.height / VH)));
  const dw = VW * scale, dh = VH * scale;
  const dx = ((canvas.width - dw) / 2) | 0;
  const dy = ((canvas.height - dh) / 2) | 0;
  ctx.drawImage(buf, 0, 0, VW, VH, dx, dy, dw, dh);
}

let last = 0;
function loop(t) {
  const dt = Math.min(0.05, last ? (t - last) / 1000 : 0);
  last = t;
  update(dt);
  draw();
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);
}

function resize() {
  canvas.width = (typeof window !== 'undefined' ? window.innerWidth : VW * 3);
  canvas.height = (typeof window !== 'undefined' ? window.innerHeight : VH * 3);
  draw();
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', resize);
}
resize();
if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);
