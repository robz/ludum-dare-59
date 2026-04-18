const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cx, cy;

export function draw(centerx = cx, centery = cy) {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('hello world', centerx, centery);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  cx = Math.random() * canvas.width;
  cy = Math.random() * canvas.height;
  draw();
}

window.addEventListener('resize', resize);
resize();
