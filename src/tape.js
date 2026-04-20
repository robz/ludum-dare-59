// Left-scrolling morse input tape. Shows ~50 unit lengths of history:
// dot/dash bars for each press, colored bands for character/word gaps, and
// small notches at every unit boundary. Newest events are drawn on the right
// and scroll leftward as time advances.

const WINDOW_UNITS = 50;

// Gap classification thresholds (in units).
const CHAR_GAP = 2.5; // silence ≥ 2.5 units → character boundary
const WORD_GAP = 5.5; // silence ≥ 5.5 units → word boundary

export function drawTape(ctx, rect, morseInput, now) {
  const { x, y, w, h } = rect;
  const unit = morseInput.getUnit();
  const windowMs = WINDOW_UNITS * unit;
  const rightEdge = now;
  const leftEdge = now - windowMs;
  const pxPerMs = w / windowMs;
  const toX = (t) => x + Math.round((t - leftEdge) * pxPerMs);

  ctx.save();

  // Background panel
  ctx.fillStyle = 'rgba(5, 14, 8, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Track baseline band
  const track = {
    top: y + h * 0.3,
    bot: y + h * 0.78,
  };
  const trackH = track.bot - track.top;

  // Unit notches along the bottom edge
  const firstUnit = Math.ceil(leftEdge / unit);
  const lastUnit = Math.floor(rightEdge / unit);
  ctx.fillStyle = 'rgba(140, 220, 170, 0.35)';
  for (let u = firstUnit; u <= lastUnit; u++) {
    const px = toX(u * unit);
    const major = u % 5 === 0;
    const nh = major ? 5 : 3;
    ctx.fillRect(px, y + h - nh - 2, 1, nh);
  }

  // Silence gaps (character/word boundaries) drawn as colored bands between presses.
  const history = morseInput.getHistory();
  const gapSegs = [];
  for (let i = 1; i < history.length; i++) {
    gapSegs.push({ start: history[i - 1].end, end: history[i].start, ongoing: false });
  }
  const pressStart = morseInput.pressStartTime();
  if (history.length > 0) {
    const lastEnd = history[history.length - 1].end;
    if (pressStart !== null) {
      gapSegs.push({ start: lastEnd, end: pressStart, ongoing: false });
    } else {
      gapSegs.push({ start: lastEnd, end: rightEdge, ongoing: true });
    }
  }

  for (const g of gapSegs) {
    if (g.end < leftEdge || g.start > rightEdge) continue;
    const gapUnits = (g.end - g.start) / unit;
    if (gapUnits < CHAR_GAP) continue;
    // Cap ongoing gaps so long silence doesn't paint the whole tape.
    const drawEnd = g.ongoing
      ? Math.min(g.end, g.start + (WORD_GAP + 2) * unit)
      : g.end;
    const s = Math.max(g.start, leftEdge);
    const e = Math.min(drawEnd, rightEdge);
    if (e <= s) continue;
    const isWord = gapUnits >= WORD_GAP;
    ctx.fillStyle = isWord
      ? 'rgba(255, 200, 90, 0.22)'
      : 'rgba(120, 190, 255, 0.18)';
    ctx.fillRect(toX(s), track.top, Math.max(1, toX(e) - toX(s)), trackH);
    const markerTime = g.start + (isWord ? WORD_GAP : CHAR_GAP) * unit;
    if (markerTime >= leftEdge && markerTime <= rightEdge) {
      const mx = toX(markerTime);
      ctx.fillStyle = isWord ? '#ffd070' : '#a7cfff';
      ctx.fillRect(mx, track.top - 4, 2, trackH + 8);
    }
  }

  // Presses: dot/dash bars
  for (const p of history) {
    if (p.end < leftEdge) continue;
    if (p.start > rightEdge) continue;
    const xa = toX(Math.max(p.start, leftEdge));
    const xb = toX(Math.min(p.end, rightEdge));
    const barW = Math.max(2, xb - xa);
    ctx.fillStyle = p.symbol === '-' ? '#b6ffc4' : '#6afc90';
    ctx.fillRect(xa, track.top + trackH * 0.15, barW, trackH * 0.7);
    // A small glyph above each press for clarity.
    ctx.fillStyle = 'rgba(200, 255, 210, 0.85)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(p.symbol === '-' ? '—' : '·', (xa + xb) / 2, track.top - 1);
  }

  // In-progress press
  if (pressStart !== null && pressStart <= rightEdge) {
    const xa = toX(Math.max(pressStart, leftEdge));
    const xb = toX(rightEdge);
    const barW = Math.max(2, xb - xa);
    ctx.fillStyle = 'rgba(182, 255, 196, 0.85)';
    ctx.fillRect(xa, track.top + trackH * 0.15, barW, trackH * 0.7);
  }

  // Right-edge "now" indicator
  ctx.fillStyle = 'rgba(200, 255, 210, 0.55)';
  ctx.fillRect(x + w - 1, y, 1, h);

  // Top-left label
  ctx.fillStyle = 'rgba(140, 255, 170, 0.6)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`TAPE · unit ${Math.round(unit)}ms`, x + 6, y + 4);
  // Legend on the right
  const lx = x + w - 6;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a7cfff';
  ctx.fillText('char', lx - 50, y + 4);
  ctx.fillStyle = '#ffd070';
  ctx.fillText('word', lx, y + 4);

  ctx.restore();
}
