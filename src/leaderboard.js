// Game-over / leaderboard screen. Title is "Mission Failed", score is the
// player's CPM, and we show how that CPM ranks against the all-time scores
// persisted in `progress.scores`.

export function drawLeaderboard(ctx, rect, stats) {
  const { x, y, w, h } = rect;
  ctx.fillStyle = 'rgba(0, 10, 5, 0.88)';
  ctx.fillRect(x, y, w, h);

  const mw = Math.min(w * 0.8, 560);
  const mh = Math.min(h * 0.8, 460);
  const mx = x + (w - mw) / 2;
  const my = y + (h - mh) / 2;

  ctx.fillStyle = 'rgba(6, 20, 10, 0.96)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#ff6a6a';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

  ctx.fillStyle = '#ffb3b3';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('MISSION FAILED', mx + mw / 2, my + 22);

  // Score block (CPM, centered)
  const scoreY = my + 70;
  ctx.fillStyle = '#eaffe1';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('SCORE', mx + mw / 2, scoreY);
  ctx.fillStyle = '#ffd070';
  ctx.font = 'bold 42px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`${stats.cpm.toFixed(1)} CPM`, mx + mw / 2, scoreY + 18);

  // Ranking
  if (stats.rank && stats.total) {
    ctx.fillStyle = '#b6ffc4';
    ctx.font = '14px monospace';
    ctx.fillText(`Rank ${stats.rank} of ${stats.total} runs`, mx + mw / 2, scoreY + 68);
  }
  if (stats.newHighScore) {
    ctx.fillStyle = '#ffe070';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('NEW HIGH SCORE', mx + mw / 2, scoreY + 88);
  }

  // Stats rows (left-aligned label, right-aligned value).
  const lines = [
    ['Enemies destroyed', stats.destroyed],
    ['Level reached',    stats.levelReached],
    ['Time survived',    `${stats.survivedSec.toFixed(1)}s`],
    ['CPM',              stats.cpm.toFixed(1)],
  ];
  ctx.font = '16px monospace';
  ctx.textBaseline = 'top';
  const startY = scoreY + 128;
  const rowH = 26;
  for (let i = 0; i < lines.length; i++) {
    const [label, value] = lines[i];
    const rowY = startY + i * rowH;
    ctx.fillStyle = 'rgba(200, 255, 210, 0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(label, mx + 40, rowY);
    ctx.fillStyle = '#eaffe1';
    ctx.textAlign = 'right';
    ctx.fillText(`${value}`, mx + mw - 40, rowY);
  }

  ctx.fillStyle = 'rgba(180, 255, 200, 0.75)';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('tap to return to title', mx + mw / 2, my + mh - 20);
}
