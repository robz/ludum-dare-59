// Dev/settings overlay. Values persist to localStorage.

export const DEFAULTS = Object.freeze({
  maxHits: 3,
  unitMs: 100,
  cutoff: 0.8,
  volume: 0.35,
  showUnit: true,
  interface: 'tree', // 'tree' | 'sliding'
});

const STORAGE_KEY = 'morse-settings-v1';

export function loadSettings() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULTS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

const ITEMS = [
  { key: 'interface', label: 'Code interface', options: ['tree', 'sliding'], fmt: v => v.toUpperCase() },
  { key: 'maxHits', label: 'Hits required to die', min: 1, max: 10, step: 1, fmt: v => `${v}` },
  { key: 'unitMs',  label: 'Initial unit duration', min: 60, max: 400, step: 10, fmt: v => `${v} ms` },
  { key: 'cutoff',  label: 'Threshold cutoff',      min: 0.5, max: 1.0, step: 0.05, fmt: v => `${v.toFixed(2)}` },
  { key: 'volume',  label: 'Master volume',         min: 0, max: 1,  step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'showUnit',label: 'Show unit (debug HUD)', toggle: true, fmt: v => v ? 'ON' : 'OFF' },
];

export class SettingsOverlay {
  constructor(settings) {
    this.settings = settings;
    this.selected = 0;
  }

  items() { return ITEMS; }

  // Returns { changed: key | 'reset' | null }
  handleKey(key) {
    if (key === 'ArrowUp')   { this.selected = (this.selected - 1 + ITEMS.length) % ITEMS.length; return { changed: null }; }
    if (key === 'ArrowDown') { this.selected = (this.selected + 1) % ITEMS.length; return { changed: null }; }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = key === 'ArrowLeft' ? -1 : 1;
      const item = ITEMS[this.selected];
      if (item.toggle) {
        this.settings[item.key] = !this.settings[item.key];
      } else if (item.options) {
        const idx = item.options.indexOf(this.settings[item.key]);
        const next = (idx + dir + item.options.length) % item.options.length;
        this.settings[item.key] = item.options[next];
      } else {
        const next = clamp((this.settings[item.key] ?? 0) + dir * item.step, item.min, item.max);
        this.settings[item.key] = Math.round(next * 1000) / 1000;
      }
      saveSettings(this.settings);
      return { changed: item.key };
    }
    if (key === 'r' || key === 'R') {
      Object.assign(this.settings, DEFAULTS);
      saveSettings(this.settings);
      return { changed: 'reset' };
    }
    return { changed: null };
  }

  draw(ctx, rect) {
    const { x, y, w, h } = rect;
    ctx.fillStyle = 'rgba(0, 10, 5, 0.82)';
    ctx.fillRect(x, y, w, h);

    const mw = Math.min(w * 0.8, 620);
    const mh = Math.min(h * 0.8, 420);
    const mx = x + (w - mw) / 2;
    const my = y + (h - mh) / 2;

    ctx.fillStyle = 'rgba(6, 20, 10, 0.96)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#4eff6d';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

    ctx.fillStyle = '#b6ffc4';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('SETTINGS', mx + mw / 2, my + 16);

    const rowH = 42;
    const startY = my + 70;
    for (let i = 0; i < ITEMS.length; i++) {
      const item = ITEMS[i];
      const rowY = startY + i * rowH;
      const active = i === this.selected;
      if (active) {
        ctx.fillStyle = 'rgba(120, 255, 160, 0.12)';
        ctx.fillRect(mx + 20, rowY - 6, mw - 40, rowH - 8);
        ctx.strokeStyle = '#4eff6d';
        ctx.strokeRect(mx + 20.5, rowY - 5.5, mw - 41, rowH - 9);
      }
      ctx.fillStyle = active ? '#eaffe1' : 'rgba(200, 255, 210, 0.8)';
      ctx.font = '15px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(item.label, mx + 36, rowY);
      const value = this.settings[item.key];
      ctx.textAlign = 'right';
      ctx.fillStyle = active ? '#b6ffc4' : '#8fffa1';
      const adjustable = !!(item.toggle || item.options || !item.toggle);
      const prefix = active ? '◂ ' : '';
      const suffix = active ? ' ▸' : '';
      const txt = `${prefix}${item.fmt(value)}${suffix}`;
      ctx.fillText(txt, mx + mw - 36, rowY);
      const def = DEFAULTS[item.key];
      if (def !== undefined && def !== value) {
        ctx.fillStyle = 'rgba(160, 200, 170, 0.5)';
        ctx.font = '11px monospace';
        ctx.fillText(`default: ${item.fmt(def)}`, mx + mw - 36, rowY + 19);
      }
    }

    ctx.fillStyle = 'rgba(180, 255, 200, 0.7)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑/↓ select   ←/→ adjust   R reset   S or ESC close', mx + mw / 2, my + mh - 26);
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
