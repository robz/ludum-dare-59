import levelsData from './levels.json' with { type: 'json' };

export const LEVELS = levelsData.levels;

export function getLevel(n) {
  const idx = Math.max(1, Math.min(LEVELS.length, n | 0)) - 1;
  return LEVELS[idx];
}

export function levelCount() { return LEVELS.length; }
