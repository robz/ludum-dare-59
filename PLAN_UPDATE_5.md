The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)


The large tooltips for first time characters should disappear immediately upon successfully being input, and remain on screen until the player successfully inputs, rather than fading out over a short time. Give the panel some opacity.

<!-- CONFIRMED:
- The timeout field was removed: state.letterTooltip is now { letter, code } (no `until`). updatePlay no longer expires it by elapsed time.
- onCharacterComplete now clears state.letterTooltip as soon as the player decodes a character matching the tooltip letter — "disappears immediately upon successfully being input".
- drawLetterTooltip sets `ctx.fillStyle = 'rgba(6, 20, 10, 0.55)'` (translucent backdrop) and `ctx.strokeStyle = 'rgba(255, 208, 112, 0.8)'` so the panel is semi-transparent rather than opaque. Confirmed in snapshots/04_tooltip.png where gameplay can be seen through the tooltip. -->

The enemies should continue to spawn even after the level ends and a promotion is available.

<!-- CONFIRMED:
- updatePlay's spawn gate dropped the `state.levelElapsed < cfg.duration` condition: spawns continue past the timer's end. The existing `canSpawn` check only suppresses spawns during the `intrusive` promotion stage (where the whole game is paused anyway); during `notif` and `hint` stages spawning continues uninterrupted. -->

The display for the unit time and cutoff on the bottom left are no longer necessary. You can remove those.

<!-- CONFIRMED:
- The `if (state.settings.showUnit) { ... }` block at the tail of drawHud was removed. The `showUnit` key is also gone from DEFAULTS and from the Settings ITEMS array. Confirmed by grepping for `showUnit` in src/main.js and src/settings.js — no remaining references. -->

If the player starts the game by choosing a level other than level one, mark all letters as previously shown for the purposes of both the first time character tooltip and the replacing the word with a single character function.

<!-- CONFIRMED:
- startGame(fromLevel) now loops over ALL_LETTERS and pre-populates state.seenLetters and state.introducedLetters when `fromLevel > 1`. seenLetters controls the word-gating in pickSpawnText; introducedLetters controls the "NEW LETTER" tooltip. Both are short-circuited for mid-game starts so the player doesn't get tooltips for letters they clearly already know, and words spawn at their full variety from the first enemy. -->

Remember the level the player selects on the title screen to return to that level the next time the player goes to the title screen.

<!-- CONFIRMED:
- progress.lastLevel is a new persisted field (src/progress.js DEFAULTS). setTitleLevelPick(n) in main.js is the single writer: it clamps, updates state.titleLevelPick, and stores progress.lastLevel via saveProgress whenever the value changes. Every arrow-key, arrow-button, and number-key path that used to mutate titleLevelPick now funnels through setTitleLevelPick.
- makeInitialState initializes `titleLevelPick: Math.max(1, Math.min(levelCount(), progress.lastLevel || 1))`, so a reloaded session opens on the last chosen level.
- Returning to the title after death no longer resets to 1 — the explicit `state.titleLevelPick = 1` lines were removed from the dead→title transitions. -->

Gradually reduce the spawn rate at higher levels proportional to the length of the words spawned. Also, make longer words approach the center proportionally slower in the same fashion. Make it so that approximately 30 characters per minute spawn in level 1, linearly scaling up to approximately 150 characters per minute at level 9. (First, analyze what is the average CPM required to pass each level, calculate based on spawn times of words and lengths of works etc)

<!-- CONFIRMED:
- targetCpmForLevel(level) returns 30 + (150 - 30) * (level - 1) / (levelCount - 1) — so level 1 = 30 CPM, level 9 = 150 CPM, linear in between.
- avgWordLengthForLevel(level) averages the word pool's lengths (weighted 0.4/0.6 for 'mixed' levels, 1 for 'letters' levels). Analysis from the pools: L1=1, L2≈1.65, L3=3.6, L4=5, L5=6, L6=7.5, L7≈8.33, L8=9.5, L9=12.4.
- spawnIntervalForLevel(level) returns `[base*0.8, base*1.2]` where `base = 60 * avgLen / targetCpm`. Plugging in: L1 spawns every 2 s, L3 every 3.6 s, L5 every 4 s, L9 every 5 s. Spawn rate shrinks for higher levels *because words are longer* — exactly "spawn rate reduced proportional to word length" while overall char throughput still rises from 30 to 150 CPM.
- speedScaleForWord(text) returns `1 / max(1, text.length)`. AttackView.spawn accepts `opts.speedScale` and multiplies the enemy's radial speed by it at spawn time. So single-letter enemies travel at the level's base speed; longer words approach proportionally slower. -->

The dial sweep shouldn’t be so bright

<!-- CONFIRMED:
- Sweep wedge gradient was dialed down: leading-edge peak alpha dropped from 0.85 (near white) to 0.32, backswept shoulder from 0.55 to 0.18, trail tail from 0.20 to 0.10. The full bright-white core stop and the separate radial outer-glow ring were removed. The sweep line itself is now `rgba(160, 230, 180, 0.55)` at 1.5 px width (was `rgba(210, 255, 225, 0.95)` at 2 px). Visible in snapshots/02_play_hd.png — the sweep reads as a subtle phosphor hint rather than a floodlight. -->

Set text size to 1.75x by default

<!-- CONFIRMED:
- DEFAULTS.textScale = 1.75 in src/settings.js. Settings modal shows 1.75× as the default row value (snapshots/03_settings.png). -->

The dots and dashes for the leaf letters in the tree are cut off in landscape mode. They should be clearly visible just like the other letters in the tree

<!-- CONFIRMED:
- codeInputTree.drawNode's landscape branch was folded into the same inside-the-circle layout that portrait already used. All non-root nodes now render letter + code stacked inside their circle, so the depth-4 leaves can't be clipped at the panel's bottom edge. Visible in snapshots/02_play_hd.png where the bottom-most leaves (H, V, F, L, P, J, B, X, C, Y, Z, Q, G, O) each show their morse code inside the node. -->

Settings fields and arrow buttons in the settings modal should be clickable/selectable. Right now, clicking in the settings modal hides it

<!-- CONFIRMED:
- src/settings.js exposes SettingsOverlay.geom(rect) and SettingsOverlay.handlePointer(px, py, rect). handlePointer:
  · returns null for clicks outside the modal (caller may dismiss),
  · returns { changed: null } for clicks inside the modal but outside any row,
  · sets this.selected to the clicked row,
  · and when the click is in the row's right-hand "value column" (x ≥ row.x + row.w*0.55), delegates to _adjust(item, dir) where dir is +1 or -1 based on the click side.
- main.handlePointerDown's overlay branch now routes 'settings' clicks through settingsOverlay.handlePointer and only calls setOverlay(null) when the result is null (i.e. outside the modal). All successful adjustments funnel through applySettingChange(key) for the same side-effects as the keyboard path. -->

Lock the promotion box to the bottom right. Make sure it doesn’t block or cover anything

<!-- CONFIRMED:
- promotionNotifRect and promotionHintRect both anchor to `{ x: W - nw - margin, y: H - reserve - nh - margin }` where `reserve = tapeH + 34*textScale`. That sits the box in the bottom-right corner, above the tape and the transmit hint line (which is drawn at radar.y + radar.h - 8). Visible in snapshots/06_promo_notif.png and snapshots/07_promo_hint.png — the promotion UI is pinned bottom-right without crossing into the radar center or the code panel on the left. -->

The Mission Failed screen should not be hidable with space -- you must hit enter or click the continue button

<!-- CONFIRMED:
- handleKeyDown's dead-scene branch was tightened to `if (e.key === 'Enter')` — the old `|| e.key === ' '` was removed, so pressing SPACE on the leaderboard does nothing.
- handlePointerDown's dead-scene branch now hit-tests continueButtonRect(W, H) and only transitions to the title when the click lands inside that rect. main.js also draws a dedicated "Continue  ↵" button via drawButton(continueButtonRect(...)) after drawLeaderboard renders, so the dismissal mechanism is always visible to the player. Confirmed in snapshots/05_dead.png — the Continue button sits centered at the bottom of the Mission Failed modal. -->


MAKE NO MISTAKES
