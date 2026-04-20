The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)


Let’s just give up on the dynamic timing system. Make the unit length default to 100ms and allow it to be manually adjusted with a slider jar within a range of 40ms to 400ms in the settings. Clean up all dynamic timing system code.

<!-- CONFIRMED:
- src/morseInput.js has been rewritten without any dynamic adaptation. The `_lastKeyDown` field, the interval-based estimate calculation in pressStart, and the initialUnit back-reference were all removed. `pressEnd` classifies against `this.cutoff * 3 * this.unit` and the timer logic derives directly from the static unit.
- src/settings.js: `unitMs` item range is now `min: 40, max: 400, step: 10` (defaults to 100). Confirmed by reading both files and noting there is no remaining reference to "dynamic" / interval-based adaptation. -->

The first time character introduction tooltip is too large. Make it smaller.

<!-- CONFIRMED:
- drawLetterTooltip: `size = Math.min(W,H) * 0.055` (down from 0.11), `boxW = metrics.width + size*0.8` (was + 40px), `boxH = size * 1.55` (was 1.4). Header font scales with `Math.max(10, size * 0.32)`. Visible in snapshots/05_tooltip.png — the NEW LETTER card is noticeably smaller than in update 3's screenshots. -->

Revert the change to the player’s score -- calculate it how it was in v3 (see git commit history to verify)

<!-- CONFIRMED:
- `git show 4ff8c94:src/main.js | grep score` returns `const score = destroyed * 100 + state.level * 50;` — the v3 formula. currentScore() in src/main.js now returns exactly `state.enemiesDestroyed * 100 + state.level * 50`, die() writes that into state.lastRun.score (and `progress.highScore` / the persistent CPM list both compare against it), and drawLeaderboard displays the raw score rather than CPM. Visible in snapshots/06_dead.png: destroyed=27, level=4 → SCORE 2900, matching 27*100 + 4*50. -->

Display the player’s current score. The floating tooltip for score increases currently displayed at the top right should instead be displayed at the location of the event providing the score increase. E.g. over the enemy as it dies.

<!-- CONFIRMED:
- drawHud emits `SCORE ${currentScore()}` in bold amber immediately below the time remaining, above DESTROYED. Visible in snapshots/02_play.png and snapshots/02_play_hd.png as a persistent top-right score readout.
- AttackView.update now also returns `result.destroyedEvents` (each `{text, nx, ny}` in radar-normalized coordinates). main.updatePlay calls `spawnScoreBubble(ev)` per event, which stashes `nx/ny` on the bubble. drawScoreBubbles resolves the radar geometry at draw time and paints the "+N" over the enemy's death position, where it rises and fades. Visible in snapshots/07_bubble.png — the "+20" and "+10" bubbles appear inside the radar at distinct radar-space coordinates, not glued to the HUD corner. -->

Add a key in the first card of the help page for what 1 unit is, based on the current value “1 unit = 100 ms (adjust in settings)”

<!-- CONFIRMED:
- drawHelp now forwards `unitMs` through to the timeline variant, which renders `1 unit = {Math.round(unitMs)} ms (adjust in settings)` in amber at the top-right of the explainer card. main.js passes `unitMs: state.settings.unitMs`. Visible in snapshots/03_help_v1.png — the key "1 unit = 100 ms (adjust in settings)" appears on the right-hand side of the card, above the A TV timeline. -->

Double the text size of all text in the gameplay page. Also add text size as a setting.

<!-- CONFIRMED:
- DEFAULTS.textScale = 2.0 in src/settings.js; the settings panel has a new "Text size" row with range 1.0–3.0 step 0.25 (fmt `${v.toFixed(2)}×`).
- main.js defines `textScale()` and `fs(base) = Math.round(base * textScale())` helpers. drawHud, drawButton, drawScoreBubbles, the debug-unit line, and the button rects (helpButtonRect/settingsButtonRect/pauseButtonRect) all multiply by textScale. At the default 2.0 the gameplay text is approximately doubled; snapshots/02_play_hd.png shows the large HUD labels, buttons, and transmit hint. -->

Add a light radar sweep graphical effect as the radar dial rotates

<!-- CONFIRMED:
- attackView.js now draws the sweep as a wide phosphor afterglow: a 1.4-radian conic-gradient trail (dim → amber brightening → near-white at the leading edge) behind the sweep line, plus a soft radial outer glow centered on the sweep's leading-edge offset. Visible in snapshots/02_play_hd.png — you can see the trailing brightness arc behind the main sweep beam rather than a sharp 0.35-radian wedge. -->

Remove the “Timeline” text

<!-- CONFIRMED:
- src/tape.js no longer draws a "TIMELINE" label; the track fills the panel from top padding to bottom padding. Confirmed by grepping tape.js for 'TIMELINE' — no matches — and visually in snapshots/02_play_hd.png where the tape area is all content with no label. -->

Replace the “Level 3 -  Short words” etc with just “Short words”

<!-- CONFIRMED:
- drawHud now renders `cfg.name.replace(/^Level\s*\d+\s*[—-]\s*/i, '')` for the subtitle beneath the rank line. So "Level 3 — Short Words" becomes "Short Words", "Level 4 — Tactical" becomes "Tactical", etc. Visible in snapshots/02_play.png ("Short Words") and snapshots/06_dead.png ("Tactical"). -->

Don’t capture keyboard modifiers like command control etc

<!-- CONFIRMED:
- handleKeyDown and handleKeyUp both start with `if (e.ctrlKey || e.metaKey || e.altKey) return;` — any chord involving Command/Control/Alt falls straight through to the browser without preventDefault or state changes. Confirmed by reading the top of both handlers. -->


MAKE NO MISTAKES
