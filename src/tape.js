// Simple left-scrolling morse timeline: dots and dashes drawn at their true
// millisecond durations against a fixed reference unit (so bars never
// rescale when the dynamic unit estimate shifts), plus a large letter
// stamped at the time each character was recognised.

const WINDOW_UNITS = 50;
const LABEL_GAP = 16;

export function drawTape(ctx, rect, morseInput, { now, referenceUnit = 100 } = {}) {
  const { x, y, w, h } = rect;
  const windowMs = WINDOW_UNITS * referenceUnit;
  const rightEdge = now;
  const leftEdge = now - windowMs;
  const pxPerMs = w / windowMs;
  const toX = (t) => x + (t - leftEdge) * pxPerMs;

  ctx.save();
  ctx.fillStyle = 'rgba(5, 14, 8, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80, 220, 110, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Track fills the panel from just below the label to the bottom edge.
  const trackTop = y + LABEL_GAP;
  const trackBottom = y + h - 2;
  const trackH = trackBottom - trackTop;

  const history = morseInput.getHistory();
  const pressStart = morseInput.pressStartTime();

  // Dot/dash bars — now take the full track height.
  for (const p of history) {
    if (p.end < leftEdge) continue;
    if (p.start > rightEdge) continue;
    const xa = toX(Math.max(p.start, leftEdge));
    const xb = toX(Math.min(p.end, rightEdge));
    const barW = Math.max(2, xb - xa);
    ctx.fillStyle = p.symbol === '-' ? '#ffd070' : '#6afc90';
    ctx.fillRect(xa, trackTop, barW, trackH);
  }

  // Ongoing press
  if (pressStart !== null && pressStart <= rightEdge) {
    const xa = toX(Math.max(pressStart, leftEdge));
    const xb = toX(rightEdge);
    ctx.fillStyle = 'rgba(182, 255, 196, 0.9)';
    ctx.fillRect(xa, trackTop, Math.max(2, xb - xa), trackH);
  }

  // Letter stamps — also full track height, drawn on top of gaps so they
  // can't collide with bars.
  const letters = morseInput.getLetterStamps();
  const letterSize = Math.max(24, Math.round(trackH * 0.95));
  ctx.font = `bold ${letterSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const ls of letters) {
    if (ls.time < leftEdge || ls.time > rightEdge) continue;
    const lx = toX(ls.time);
    ctx.fillStyle = '#eaffe1';
    ctx.fillText(ls.letter, lx, trackTop + trackH / 2);
  }

  // Right-edge "now" seam.
  ctx.fillStyle = 'rgba(200, 255, 210, 0.45)';
  ctx.fillRect(x + w - 1, trackTop, 1, trackH);

  // Label in the top-left corner.
  ctx.fillStyle = 'rgba(140, 255, 170, 0.55)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('TIMELINE', x + 6, y + 3);

  ctx.restore();
}
