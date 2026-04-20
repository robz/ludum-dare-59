// Persistent progress: best score, deepest level reached.

const STORAGE_KEY = 'morse-progress-v1';

const DEFAULTS = { highScore: 0, maxLevel: 1, scores: [], seenPromotionModal: false };

export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return cloneDefaults();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaults(),
      ...parsed,
      scores: Array.isArray(parsed.scores) ? parsed.scores.slice() : [],
    };
  } catch { return cloneDefaults(); }
}

function cloneDefaults() {
  return { ...DEFAULTS, scores: [] };
}

export function saveProgress(p) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

// Record a CPM score and return { rank, total } — 1-indexed ranking in the
// all-time sorted list (highest CPM = rank 1).
export function recordScore(progress, cpm) {
  const scores = progress.scores || (progress.scores = []);
  scores.push(cpm);
  scores.sort((a, b) => b - a);
  while (scores.length > 200) scores.pop();
  const rank = scores.indexOf(cpm) + 1; // first index matching equal CPM
  return { rank, total: scores.length };
}
