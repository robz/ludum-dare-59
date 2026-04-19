// International morse code for English letters only.
export const LETTER_TO_CODE = {
  A: '.-',   B: '-...', C: '-.-.', D: '-..',  E: '.',
  F: '..-.', G: '--.',  H: '....', I: '..',   J: '.---',
  K: '-.-',  L: '.-..', M: '--',   N: '-.',   O: '---',
  P: '.--.', Q: '--.-', R: '.-.',  S: '...',  T: '-',
  U: '..-',  V: '...-', W: '.--',  X: '-..-', Y: '-.--',
  Z: '--..',
};

export const CODE_TO_LETTER = Object.fromEntries(
  Object.entries(LETTER_TO_CODE).map(([k, v]) => [v, k])
);

export const ALL_LETTERS = Object.keys(LETTER_TO_CODE);

// In the tree, the parent of a letter is the letter whose code
// is this letter's code minus its last symbol. Root ("") is START.
export function parentLetter(letter) {
  const code = LETTER_TO_CODE[letter];
  if (!code || code.length <= 1) return null;
  return CODE_TO_LETTER[code.slice(0, -1)] || null;
}

// Lineage: all ancestors up to the root (exclusive).
export function ancestors(letter) {
  const out = [];
  let p = parentLetter(letter);
  while (p) { out.push(p); p = parentLetter(p); }
  return out;
}

// Child code for a node given '.' or '-'. Returns letter or null.
export function childOf(code, symbol) {
  const next = code + symbol;
  return CODE_TO_LETTER[next] || null;
}

export function codeToLetter(code) {
  if (code === '') return null;
  return CODE_TO_LETTER[code] || null;
}
