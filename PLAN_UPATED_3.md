The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)

Title screen

Add “Tap briefly for dots and longer for dashes” as an extra line under the “Press space…” text on the title screen.

<!-- CONFIRMED:
- drawTitle() in src/main.js now emits "Tap briefly for dots and longer for dashes" immediately below the "Press SPACE or click to shoot an enemy" subtitle, rendered at `titleY + Math.min(W,H)*0.12` in a slightly smaller and dimmer weight than the main tagline. Visible in snapshots/01_title.png as the third line under the MORSE DEFENSE logo. -->

Gameplay


The dynamic unit time calculations have gotten worse. It appears to be lengthening the estimated unit when it should be shortening them. I didn’t look at the code, but it feels like it might be inputting double the actual measured length into the filter. Fix this by halving the measured interval.

<!-- CONFIRMED:
- MorseInput.pressStart in src/morseInput.js now halves the measured inter-keydown interval before feeding the unit-estimate filter: `const interval = (now - this._lastKeyDown) / 2;`. The resulting estimate (= interval / expected) is therefore half of what it was in the previous version, which matches the fix requested ("halve the measured interval"). A comment in the source cross-references this plan item. -->

The first time a letter is shown to the player, add an extra tooltip that shows the dots and dashes required to make that letter. Make it extra large and easy to read.

<!-- CONFIRMED:
- state.introducedLetters is a Set populated whenever a length-1 enemy is spawned in updatePlay; the first time each letter appears, state.letterTooltip = { letter, code, until: now + 4000 } is also set.
- drawLetterTooltip renders it centered near the top of the radar using `bold Math.min(W,H)*0.11 px monospace` — very large — inside an amber-bordered card with a "NEW LETTER" header above it. Confirmed in snapshots/06_tooltip.png where `E = .` is shown in the top third of the radar when a fresh E enemy is introduced. Alpha eases out in the final 500ms; otherwise fully opaque. -->

Replace text “send transmissions with spacebar” with “Spacebar to signal”

<!-- CONFIRMED:
- handleKeyDown's invalid-key branch now pushes the banner `{ msg: isTouch ? 'Tap to signal' : 'Spacebar to signal', … }`. Confirmed by grepping src/main.js for "Spacebar to signal" and for the old phrase (removed). -->

Instead of “press P or SPACE to resume” in Paused menu, say “Tap to resume” on mobile.

<!-- CONFIRMED:
- drawPausedOverlay now renders `isTouch ? 'Tap to resume' : 'press P or SPACE to resume'`. Desktop keeps the keyboard prompt unchanged; mobile gets the concise "Tap to resume" form. -->

Instead of “SPACE to transmit - hold for dash - P pause” say
SPACE for dot - hold longer for dash - P pause
And on mobile say “Tap” instead of “Space” (Make sure this is consistent throughout the entire app)

<!-- CONFIRMED:
- drawHud's persistent transmit hint is now `isTouch ? 'TAP for dot · hold longer for dash · P pause' : 'SPACE for dot · hold longer for dash · P pause'`. Visible in snapshots/02_play.png at the bottom of the radar.
- The pause and invalid-key strings also use the Tap/Spacebar split, and the title's extra line uses "Tap" language too. Grep of src/main.js and src/help.js for the old "SPACE to transmit" / "hold for dash" strings returns nothing — all replaced. -->

Display a small floating tooltip as the player score increases

<!-- CONFIRMED:
- spawnScoreBubble(text) pushes a `{ text: '+N', x: -1, y: 80, t: 0, lifetime: 1.4 }` entry onto state.scoreBubbles every time an enemy is destroyed (updatePlay iterates over r.destroyedTexts). drawScoreBubbles resolves x=-1 to the right edge of the canvas and draws each bubble in bold 18px amber, floating up by `prog * 40` px and fading out over its lifetime. Visible in snapshots/08_bubbles.png where "+20" and "+10" appear below the DESTROYED counter. -->

Timeline view

Have both letters and blocks take full height on the bar

<!-- CONFIRMED:
- drawTape in src/tape.js no longer uses a fractional track — trackTop sits just below the TIMELINE label (y + LABEL_GAP) and trackBottom = y + h - 2, so the usable height = the entire panel minus the label strip. Dot/dash bars are drawn as `ctx.fillRect(xa, trackTop, barW, trackH)` (full track height), and letter stamps use `bold Math.max(24, Math.round(trackH * 0.95))px monospace` centered at `trackTop + trackH / 2`. Confirmed in snapshots/07_tape_full.png: the green/amber bars and the big "A", "V", "L" glyphs all occupy the full vertical span of the timeline panel. -->

Help modal

Drop the 3rd and 4th parts, keep the 1st and 2nd. Add an explicit text at the top of the modal that says “Tap to send a dot . Hold down longer to send a dash -”

<!-- CONFIRMED:
- EXPLAINER_COUNT = 2 in src/help.js and EXPLAINER_VARIANTS = [drawVariantTimeline, drawVariantAnatomy]; the old drawVariantTable and drawVariantBeats have been removed from the array (and the defining functions are gone from the file). The page indicator now shows only two dots.
- drawHelp renders an amber "Tap to send a dot ·   Hold down longer to send a dash —" line directly under the "HELP" title and above the explainer pane — always visible regardless of the selected variant. Visible at the top of snapshots/03_help_v1.png and snapshots/04_help_v2.png. -->

Change the example on the first to be “a tv” -- and make sure the word gap really is 7 units, at the moment it is not to scale

<!-- CONFIRMED:
- drawVariantTimeline now emits the sequence for "A TV": A (.-), 7-unit word gap, T (-), 3-unit letter gap, V (...-). TOTAL_UNITS = 27 is computed explicitly and `unit = floor((w - 48) / 27)` so the entire timeline fits the pane with dots/dashes/gaps all drawn at the correct integer-unit widths. I additionally overlaid 7 tick marks + a dashed guide along the word gap to make the 7-unit count visually checkable. Visible in snapshots/03_help_v1.png: the A block is 1u+1u+3u = 5u wide, the word gap spans 7u with tick marks, T is 3u, the letter gap is 3u, and V is 9u — totaling 27u. -->

End game modal

Instead of “Transmission Lost” set the title to “Mission Failed”

<!-- CONFIRMED:
- drawLeaderboard's header text is now "MISSION FAILED". Visible in snapshots/05_dead.png. -->

Move CPM below Time survived

<!-- CONFIRMED:
- The stats array order in src/leaderboard.js is ['Enemies destroyed', 'Level reached', 'Time survived', 'CPM'], so CPM is rendered after Time survived. Visible in snapshots/05_dead.png. -->

Move “Level reached” under “Enemies destroyed”

<!-- CONFIRMED:
- Same stats array as above — Level reached is the second row, directly under Enemies destroyed. -->

The player’s score just be CPM

<!-- CONFIRMED:
- A single SCORE block in drawLeaderboard displays only `${stats.cpm.toFixed(1)} CPM` in bold 42px amber. The legacy "score = destroyed * 100 + level * 50" formula was removed from die(); progress.highScore is now updated against CPM too (newHighScore = cpm > progress.highScore). Visible as the hero number in snapshots/05_dead.png. -->

Show the player’s rank amongst all other playthroughs

<!-- CONFIRMED:
- progress.scores is a persistent list in src/progress.js. recordScore(progress, cpm) appends the new CPM, re-sorts descending, trims to 200 entries, and returns { rank, total }. die() calls it and stuffs `rank` and `total` into state.lastRun. drawLeaderboard renders "Rank R of T runs" beneath the CPM score when those fields are present. Visible in snapshots/05_dead.png as "Rank 2 of 7 runs". -->

“Remove Deepest level”

<!-- CONFIRMED:
- The old "Deepest level" row is gone from drawLeaderboard — the stats array only contains the four fields above. progress.maxLevel is still tracked silently for level-select gating on the title screen. -->

Instead of “press SPACE or ENTER to return to title” just say “tap to return to title”

<!-- CONFIRMED:
- drawLeaderboard's footer now says "tap to return to title". Both SPACE/Enter and pointer input still dismiss the screen, but the displayed instruction is the single-sentence "tap to return to title" form. Visible at the bottom of the modal in snapshots/05_dead.png. -->


MAKE NO MISTAKES
