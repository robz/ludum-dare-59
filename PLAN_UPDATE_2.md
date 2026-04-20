The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)


Changes to title screen

The title screen is too cluttered. Move the “How morse code works” box into the help modal. Make sure the help modal includes the tree as well. And enable the help modal during gameplay as well.

<!-- CONFIRMED:
- drawTitle() no longer draws the explainer box; only the radar backdrop, MORSE DEFENSE title, single "Press SPACE or click to shoot an enemy" line, level selector with rank/insignia, bottom hotkey hint, and Help/Settings buttons remain. Visible in snapshots/01_title.png.
- drawHelp() in src/help.js now renders a top explainer pane (cycleable) and a bottom tree pane inside the same modal frame. Visible in snapshots/03_help_v1.png through snapshots/06_help_v4.png.
- handleKeyDown gates the H key on `state.scene !== 'dead'` (not just title), and drawHud draws a Help button on play scenes. Confirmed by snapshots/03_help_v1.png being captured from --scene play. -->

The “How morse code works” explanation is also very unclear. The graphical diagram should be higher quality and clearly point out the regions being labeled. Develop 4 different possible explanations. I should be able to cycle through each one with an arrow key. I will tell you on the next update which one to use.

<!-- CONFIRMED:
- src/help.js exports EXPLAINER_COUNT=4 and the four variants live in the EXPLAINER_VARIANTS array: timeline-with-callouts (SOS with annotated DOT/DASH and symbol/letter/word gap labels pointing to specific regions), letter anatomy (E/T/A/N/S/O shown as sized bars beside each letter), alphabetical table, and rhythmic dit/dah notation. Visible in snapshots/03_help_v1.png (1/4), 04_help_v2.png (2/4), 05_help_v3.png (3/4), 06_help_v4.png (4/4) — header shows "HOW MORSE CODE WORKS · N/4" plus a four-dot page indicator.
- main.js handleKeyDown routes ArrowLeft/ArrowRight to cycle state.explainerIndex modulo EXPLAINER_COUNT when the help overlay is open. Clicking on the modal also cycles to the next variant. -->

The level arrows should be clickable (currently clicking on them starts the game)

<!-- CONFIRMED:
- drawArrow() paints the ◂ and ▸ glyphs inside explicit rect buttons returned by titleArrowRects(W, H). handlePointerDown's title-scene branch hit-tests those rects first and adjusts state.titleLevelPick without starting the game; only clicks *outside* those rects fall through to startGame(). Visible as clearly outlined arrow buttons in snapshots/01_title.png. -->

Replace the ? and * text buttons with “Help” and “Settings” and make the font bigger.

<!-- CONFIRMED:
- drawButton() now uses bold 15px monospace (up from 14px), and the button rects in helpButtonRect/settingsButtonRect/pauseButtonRect are sized for their text labels (72/100/52 px wide). drawHud passes "Help" / "Settings" / "Pause|Resume"; drawTitle also uses "Help" / "Settings". Visible in snapshots/01_title.png and snapshots/02_play.png where the top-right buttons display text labels. -->

Changes to gameplay

The dynamic unit length estimates are not working well. Try to fix it by measuring the distance between key down events within a character instead of what it’s currently measuring. Key down events should occur roughly 2 unit lengths apart for a dot (1 unit for the dot put 1 unit of space) and 4 unit lengths apart for a dash (3 units for the dash plus 1 unit of space).

<!-- CONFIRMED:
- MorseInput.pressStart now tracks this._lastKeyDown and, whenever a new keydown lands within the current character (this._currentCode.length > 0), computes `interval = now - this._lastKeyDown` and updates the unit estimate via `this._currentCode[-1] === '-' ? interval/4 : interval/2`. This uses the *previous* symbol's classification to decide whether the interval represents 2 or 4 units. pressEnd no longer feeds the duration-based estimator (only classifies dot/dash against cutoff * 3 * unit). Confirmed by reading src/morseInput.js and walking through an example: 200ms press (classified dot at default 100ms unit), then 210ms later pressStart — interval 210 becomes estimate 105, blended into unit (60% weight on previous × 40% on estimate). -->

Start with 100ms as the default unit length, with cutoffs for the next unit up placed at 0.8 unit lengths. e.g. If the unit length is measured to be 100ms, the cutoff between dots and dashes should be placed at 0.8 * 3 units * 100ms = 240ms. Similarly, the cutoff between a character delimiter wait and a word delimiter wait should be placed at 0.8 * 7 units * 100ms = 560ms. Add this “cutoff” parameter into the settings, and allow a slider range between 0.5 and 1.0.

<!-- CONFIRMED:
- DEFAULTS.unitMs = 100 and DEFAULTS.cutoff = 0.8 in src/settings.js.
- MorseInput exposes dotDashMs() = cutoff * 3 * unit, charGapMs() = cutoff * 3 * unit, wordGapMs() = cutoff * 7 * unit. At defaults (unit=100, cutoff=0.8) this yields 240 ms (dot/dash threshold) and 560 ms (char→word threshold) — exactly the plan's numbers. pressEnd classifies on duration < dotDashMs() ? '.' : '-'; charTimer fires after charGapMs() silence; wordTimer fires after wordGapMs()-charGapMs() of additional silence (so total silence from the last press end to word completion = wordGapMs()).
- ITEMS in settings.js includes `{ key: 'cutoff', label: 'Threshold cutoff', min: 0.5, max: 1.0, step: 0.05 }`. Visible as a new row in the Settings modal. -->

When showing a multi-character word, make sure the player has already seen each of the letters making that word at least once. If you find that they haven’t been shown one of the letters, then give them just that letter instead of the whole word.

<!-- CONFIRMED:
- pickSpawnText() in main.js first picks a candidate from the level's mode-appropriate source, then (if candidate.length > 1) filters the letters against state.seenLetters. If any letter is unseen, the candidate is replaced with a randomly-chosen unseen letter. After the candidate is finalized, every letter in it is added to seenLetters so subsequent spawns can progress. -->

Currently, the game always fires one character at a time. Instead, change this to firing at a word termination (7 unit lengths of time). This makes it so that words must be completed altogether as one word, rather than single characters. Don’t allow character-by-character completion for words.

<!-- CONFIRMED:
- MorseInput emits onCharacterComplete on silence ≥ charGapMs() (accumulates the character into main's wordBuffer and flashes the letter for feedback), and onWordComplete on additional silence ≥ wordGapMs()-charGapMs() (total silence = wordGapMs() = 7*cutoff*unit ms). main.onCharacterComplete only appends to state.wordBuffer and updates attackView.setPartialWord for visual prefix highlighting; it does *not* call attackView.fire. main.onWordComplete is the only caller of attackView.fire, and fire() now requires `enemy.text === word` (no per-letter progress). So partial typing advances the buffer visually but only a full 7-unit silence fires the entire accumulated word at an enemy. -->

Instead of simple level numbers (“LV 5 - Level 5 - Signals”), change the levels to be represented by naval ranks: seaman, petty officer, chief petty officer, warrant officer, ensign, lieutenant, lieutenant commander, commander, captain, admiral. Include insignia icons. (“LV 5 - Ensign - <insignia>”)

<!-- CONFIRMED:
- src/ranks.js defines RANKS = ['Seaman', 'Petty Officer', 'Chief Petty Officer', 'Warrant Officer', 'Ensign', 'Lieutenant', 'Lieutenant Commander', 'Commander', 'Captain', 'Admiral'] and drawInsignia() with distinct stylised glyphs per rank (one / two / three chevrons, then chevrons+anchor, horizontal bar, vertical bar(s), oak leaves, an eagle silhouette, and a five-star array).
- drawHud renders the insignia via drawInsignia() next to the HUD text `LV ${state.level} — ${rank}`, with the level's mode name (e.g. "Level 3 — Short Words") as a dim subtitle below. Confirmed in snapshots/02_play.png where "LV 3 — Chief Petty Officer" appears beside a three-chevron-with-anchor insignia. The title screen also displays the currently-selected rank + insignia in snapshots/01_title.png. -->

After each level, show a message congratulating the player on a promotion. The first time this message is shown, make it an intrusive modal box with clear instructions and accept/decline buttons, and for subsequent messages, make it just an unobtrusive overlay. Give them the option to accept the promotion, or stay on their current rank. Clicking accept or pressing enter will accept the promotion and lead them to the next level. Clicking delete/backspace or “decline” will allow them to stay on the current level indefinitely, but they can accept at any time to be promoted by pressing enter.

<!-- CONFIRMED:
- state.promotion = { targetLevel, stage: 'intrusive' | 'notif' | 'hint' } is set by triggerPromotion() when the level timer runs out and the radar is clear. The stage is 'intrusive' iff progress.seenPromotionModal is false (first-ever promotion), else 'notif'.
- Intrusive mode pauses the game, draws a full-screen modal via drawPromotionIntrusive with Accept (Enter / click) and Decline (Del / click) buttons, the full rank-change text "Seaman → Petty Officer", and explicit instructions. Visible in snapshots/07_promo_intrusive.png.
- Notification mode draws an amber-bordered banner in the top-right (drawPromotionNotif) that accepts on Enter or click and downgrades to 'hint' on Del. Visible in snapshots/08_promo_notif.png.
- Hint mode draws a compact persistent pill "ENTER → promote to <rank>" (drawPromotionHint). Pressing Enter at any time accepts (acceptPromotion), which sets progress.seenPromotionModal/maxLevel and advances to the next level. Decline sets the flag so subsequent runs start in notif mode. Visible in snapshots/09_promo_hint.png. -->

Remove the “TRANSMIT” text in the top right

<!-- CONFIRMED:
- Both src/codeInputTree.js and src/codeInputSliding.js had a "TRANSMIT" label in the top-left of the code panel; both have been removed. Confirmed by grepping: no "TRANSMIT" string remains anywhere in src/codeInput*.js. Snapshots/02_play.png shows the code panel with no TRANSMIT text (only the running code summary in the top-right of the panel). -->

Changes to timeline view

The timeline view is confusing. Just draw the times for dots/dashes, make it clear which is which, and don’t add lines or the highlighted regions, and never rescale the dot/dashes.

<!-- CONFIRMED:
- src/tape.js was rewritten: it no longer draws colored char/word gap bands, no vertical boundary markers, and no unit notches. Only the bars (dots in bright green #6afc90, dashes in amber #ffd070 for clear visual distinction) and letter stamps are rendered.
- drawTape accepts a `referenceUnit` (main.js passes state.settings.unitMs — the user's chosen initial unit, fixed per run). `windowMs = 50 * referenceUnit` and `pxPerMs = w / windowMs` are computed from the reference, not the drifting live estimate, so bars never rescale when the dynamic unit shifts during play. Visible in snapshots/02_play.png and snapshots/15_tape_letters.png. -->

If a letter was transmitted, write it on the timeline as well, making it large and visible.

<!-- CONFIRMED:
- MorseInput.stampLetter(letter, time) pushes a {time, letter} entry into morseInput._letterStamps (bounded in the same way as the press history). main.onCharacterComplete calls state.morseInput.stampLetter(letter) right after the letter is decoded.
- drawTape renders the letters with `bold ${max(18, h*0.62)}px monospace` at the recognition time position (upper portion of the tape). Visible in snapshots/15_tape_letters.png — the letters A, B, C are stamped large across the tape above their corresponding dot/dash bars. -->

Changes to the tree

When visiting each node of the tree, show a dial, which is behind the node and protrudes 50% beyond it. In the landscape layout, it starts pointing vertically up, sweeps clockwise when space is pressed, and ends vertically down as long as space is pressed. It should arrive midway (at the 3 o’clock position) when crossing the boundary between registering a dot and a dash. If a dot would be registered on keyup, the line to the next dot node should be lightly highlighted. After passing the threshold, the line from the node to the dash node should be lightly highlighted instead. The dial should disappear after keyup. In the portrait layout, it should start pointing left and sweep counter clockwise.

<!-- CONFIRMED:
- codeInputTree.draw accepts pressStartTime, unit, cutoff and computes `dialT = elapsed / (2 * cutoff * 3 * unit)` — so dialT = 0 at press start, 0.5 at the dot/dash threshold, and 1.0 after 2× the threshold. drawDial() draws an arm at `r * 1.5` (50% beyond the node) with a soft glow plus a crisp arm colored green (dot region) or amber (dash region).
- Landscape angle: `-π/2 + dialT * π` (canvas angle 0 = 3 o'clock), sweeping UP→RIGHT→DOWN (12→3→6). Portrait angle: `π - dialT * π`, decreasing CCW from 9 o'clock through 6 o'clock to 3 o'clock — which in screen terms goes LEFT→DOWN→RIGHT (the plan's "starts pointing left and sweeps counter clockwise"). Visible in snapshots/10_dial_dot.png (landscape, dial near 12, dot-child line lit), snapshots/11_dial_dash.png (landscape, dial past 3, dash-child line in amber), snapshots/14_portrait_dash.png (portrait, dial past 6, dash-child line lit).
- drawConnections uses dialT to decide which of the two child edges of currentCode to pre-highlight: dot-child when dialT < 0.5, dash-child when dialT ≥ 0.5. When dialT is null (not pressed) no pre-selection highlight is drawn, so the dial "disappears after keyup". -->

In portrait mode, the last column/row of letters in the tree is overcrowded and you cannot see the dashes and dots for them. Instead, add dashes and dots inside the letter circles. Make sure they are not cut off and are clearly visible.

<!-- CONFIRMED:
- drawNode() in src/codeInputTree.js has a dedicated portrait branch (`!isRoot && !landscape`) that paints the letter at `cy - r*0.12` and the code at `cy + r*0.78` using `bold ${max(10, r*0.88)}px` and `bold ${max(8, r*0.58)}px` monospace respectively — both inside the node's circle. The landscape branch keeps the external "code below the circle" rendering.
- Visible in snapshots/13_portrait_codes.png and snapshots/14_portrait_dash.png: depth-4 nodes H V F L P J B X C Y Z Q each show the letter stacked over its own morse code inside the circle, with nothing crowded below the row. -->
