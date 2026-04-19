// Game-over / leaderboard screen showing round stats and best scores.

export function drawLeaderboard(ctx, rect, stats) {
  const { x, y, w, h } = rect;
  ctx.fillStyle = 'rgba(0, 10, 5, 0.88)';
  ctx.fillRect(x, y, w, h);

  const mw = Math.min(w * 0.8, 560);
  const mh = Math.min(h * 0.8, 440);
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
  ctx.fillText('TRANSMISSION LOST', mx + mw / 2, my + 20);

  const lines = [
    ['Enemies destroyed', stats.destroyed],
    ['Characters sent', stats.charsSent],
    ['CPM', stats.cpm.toFixed(1)],
    ['Time survived', `${stats.survivedSec.toFixed(1)}s`],
    ['Level reached', stats.levelReached],
    ['', ''],
    ['Best score', stats.highScore],
    ['Deepest level', stats.maxLevel],
  ];

  ctx.font = '16px monospace';
  ctx.textBaseline = 'top';
  const startY = my + 80;
  const rowH = 28;
  for (let i = 0; i < lines.length; i++) {
    const [label, value] = lines[i];
    if (!label && !value) continue;
    const rowY = startY + i * rowH;
    ctx.fillStyle = 'rgba(200, 255, 210, 0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(label, mx + 40, rowY);
    ctx.fillStyle = '#eaffe1';
    ctx.textAlign = 'right';
    ctx.fillText(`${value}`, mx + mw - 40, rowY);
  }

  if (stats.newHighScore) {
    ctx.fillStyle = '#ffe070';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEW HIGH SCORE', mx + mw / 2, my + mh - 68);
  }

  ctx.fillStyle = 'rgba(180, 255, 200, 0.75)';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('press SPACE or ENTER to return to title', mx + mw / 2, my + mh - 36);
}
