// Persistent progress: best score, deepest level reached.

const STORAGE_KEY = 'morse-progress-v1';

const DEFAULTS = { highScore: 0, maxLevel: 1 };

export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULTS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveProgress(p) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}
