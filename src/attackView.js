// Radar attack view: circular radar with a sweeping dial, incoming enemies,
// outgoing missiles, and a health/score display.
//
// This module does not read input or manage game state beyond its own
// entities. main.js spawns enemies, fires missiles (via .fire), and reads
// back damage/destruction events from .update().

const SWEEP_PERIOD_SEC = 3.2;
const LIT_FADE_MS = 1500;
const MISSILE_TRAVEL_SEC = 0.35;

export class AttackView {
  constructor({ enemySpeed = 16, rngFn = Math.random } = {}) {
    this.enemySpeed = enemySpeed;
    this.rng = rngFn;
    this.enemies = [];
    this.missiles = [];
    this.sweepAngle = -Math.PI / 2;
    this.nextEnemyId = 1;
    this.explosions = [];
  }

  setEnemySpeed(sp) { this.enemySpeed = sp; }

  spawn(text) {
    const angle = this.rng() * Math.PI * 2;
    this.enemies.push({
      id: this.nextEnemyId++,
      text: text.toUpperCase(),
      angle,
      r: 1.0,
      speed: this.enemySpeed,
      litAt: -Infinity,
      dying: false,
    });
  }

  activeCount() {
    return this.enemies.filter(e => !e.dying).length;
  }

  setPartialWord(text) {
    this._partialWord = (text || '').toUpperCase();
  }

  // Fire a missile against an enemy whose full text equals `word`.
  // Returns { hit, text }.
  fire(word) {
    word = (word || '').toUpperCase();
    const target = this.enemies.find(e => !e.dying && e.text === word);
    if (!target) return { hit: false, text: word };
    target.dying = true;
    this.missiles.push({
      fromX: 0, fromY: 0,
      targetId: target.id,
      completed: true,
      t: 0,
    });
    return { hit: true, text: word };
  }

  update(dt, now = performance.now()) {
    const result = { damageTaken: 0, destroyed: 0 };
    this.sweepAngle += (Math.PI * 2 / SWEEP_PERIOD_SEC) * dt;
    if (this.sweepAngle > Math.PI) this.sweepAngle -= Math.PI * 2;

    for (const e of this.enemies) {
      if (e.dying) continue;
      e.r -= (e.speed / 400) * dt;
      // Lit by sweep?
      const rel = shortestAngle(e.angle, this.sweepAngle);
      if (Math.abs(rel) < 0.08) e.litAt = now;
      if (e.r <= 0.02) {
        result.damageTaken += 1;
        e.dying = true;
        e.finished = true;
      }
    }

    // Advance missiles
    for (const m of this.missiles) {
      const target = this.enemies.find(e => e.id === m.targetId);
      if (!target) { m.done = true; continue; }
      m.t += dt / MISSILE_TRAVEL_SEC;
      if (m.t >= 1) {
        m.done = true;
        const tx = Math.cos(target.angle) * target.r;
        const ty = Math.sin(target.angle) * target.r;
        target.litAt = now;
        this.explosions.push({ x: tx, y: ty, t: 0, big: !!m.completed });
        if (m.completed) {
          result.destroyed += 1;
          (result.destroyedTexts ||= []).push(target.text);
          (result.destroyedEvents ||= []).push({
            text: target.text,
            nx: tx,
            ny: ty,
          });
        }
      }
    }

    for (const ex of this.explosions) ex.t += dt;

    this.enemies = this.enemies.filter(e => !(e.dying && (e.finished || !this.missiles.some(m => m.targetId === e.id && !m.done))));
    this.missiles = this.missiles.filter(m => !m.done);
    this.explosions = this.explosions.filter(ex => ex.t < 0.7);
    return result;
  }

  draw(ctx, rect, { now = performance.now() } = {}) {
    const { x, y, w, h } = rect;
    ctx.save();
    ctx.fillStyle = '#040a06';
    ctx.fillRect(x, y, w, h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const radius = Math.min(w, h) * 0.46;

    // Vignette background
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, 'rgba(30, 90, 50, 0.55)');
    g.addColorStop(0.6, 'rgba(10, 50, 20, 0.35)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();

    // Concentric rings
    ctx.strokeStyle = 'rgba(80, 220, 110, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (i / 4), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Cross hairs
    ctx.strokeStyle = 'rgba(80, 220, 110, 0.25)';
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
    ctx.stroke();
    // 45 degree spokes
    ctx.strokeStyle = 'rgba(80, 220, 110, 0.12)';
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (Math.PI / 2) * k;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.stroke();
    }

    // Sweep wedge + phosphor afterglow trail
    ctx.save();
    ctx.translate(cx, cy);
    const trailArc = 1.4; // radians behind the leading edge
    const sg = ctx.createConicGradient
      ? ctx.createConicGradient(this.sweepAngle - trailArc, 0, 0)
      : null;
    if (sg) {
      // Bright phosphor spike at the leading edge, long exponential fade back.
      sg.addColorStop(0.0, 'rgba(150, 255, 170, 0.0)');
      sg.addColorStop(0.45, 'rgba(120, 255, 140, 0.04)');
      sg.addColorStop(0.75, 'rgba(140, 255, 160, 0.20)');
      sg.addColorStop(0.95, 'rgba(220, 255, 220, 0.55)');
      sg.addColorStop(trailArc / (Math.PI * 2), 'rgba(255, 255, 255, 0.85)');
      sg.addColorStop(Math.min(1, (trailArc + 0.015) / (Math.PI * 2)), 'rgba(255, 255, 255, 0.0)');
      sg.addColorStop(1, 'rgba(120, 255, 140, 0.0)');
      ctx.fillStyle = sg;
    } else {
      ctx.fillStyle = 'rgba(120, 255, 140, 0.2)';
    }
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, this.sweepAngle - trailArc, this.sweepAngle + 0.02);
    ctx.closePath();
    ctx.fill();

    // Soft outer glow ring rotating just outside the trail.
    const glow = ctx.createRadialGradient(
      Math.cos(this.sweepAngle) * radius * 0.7,
      Math.sin(this.sweepAngle) * radius * 0.7,
      0,
      Math.cos(this.sweepAngle) * radius * 0.7,
      Math.sin(this.sweepAngle) * radius * 0.7,
      radius * 0.35
    );
    glow.addColorStop(0, 'rgba(180, 255, 200, 0.25)');
    glow.addColorStop(1, 'rgba(120, 255, 140, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(
      Math.cos(this.sweepAngle) * radius * 0.6,
      Math.sin(this.sweepAngle) * radius * 0.6,
      radius * 0.4, 0, Math.PI * 2
    );
    ctx.fill();

    // Crisp leading sweep line
    ctx.strokeStyle = 'rgba(210, 255, 225, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(this.sweepAngle) * radius, Math.sin(this.sweepAngle) * radius);
    ctx.stroke();
    ctx.restore();

    // Enemies
    const partial = this._partialWord || '';
    for (const e of this.enemies) {
      if (e.dying && e.finished) continue;
      const ex = cx + Math.cos(e.angle) * e.r * radius;
      const ey = cy + Math.sin(e.angle) * e.r * radius;
      const lit = Math.max(0, 1 - (now - e.litAt) / LIT_FADE_MS);
      const baseAlpha = 0.28 + 0.72 * lit;
      const prefixMatch = partial && e.text.startsWith(partial) ? partial.length : 0;
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = prefixMatch > 0 ? '#ffd070' : '#b6ffc4';
      ctx.beginPath(); ctx.arc(ex, ey, 4 + 2 * lit, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const ty = ey - 10;
      const charW = 11;
      const total = e.text.length;
      const startX = ex - ((total - 1) * charW) / 2;
      for (let i = 0; i < total; i++) {
        const matched = i < prefixMatch;
        ctx.fillStyle = matched ? '#ffd070' : '#eaffe1';
        ctx.fillText(e.text[i], startX + i * charW, ty);
      }
      ctx.restore();
    }

    // Missiles
    for (const m of this.missiles) {
      const target = this.enemies.find(en => en.id === m.targetId);
      if (!target) continue;
      const tx = cx + Math.cos(target.angle) * target.r * radius;
      const ty = cy + Math.sin(target.angle) * target.r * radius;
      const mx = cx + (tx - cx) * m.t;
      const my = cy + (ty - cy) * m.t;
      // trail
      ctx.strokeStyle = 'rgba(255, 220, 140, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const trailT = Math.max(0, m.t - 0.25);
      ctx.moveTo(cx + (tx - cx) * trailT, cy + (ty - cy) * trailT);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.fillStyle = '#fff5c0';
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Explosions
    for (const ex of this.explosions) {
      const r = ex.t / 0.7;
      const alpha = 1 - r;
      const px = cx + ex.x * radius;
      const py = cy + ex.y * radius;
      const big = ex.big;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = big ? '#ffd070' : '#b6ffc4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 4 + r * (big ? 32 : 16), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = big ? 'rgba(255, 200, 120, 0.5)' : 'rgba(180, 255, 200, 0.4)';
      ctx.beginPath(); ctx.arc(px, py, 3 + r * (big ? 12 : 6), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Center tower
    ctx.fillStyle = '#b6ffc4';
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#eaffe1';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  }
}

function shortestAngle(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
