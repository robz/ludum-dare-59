The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)

Changes to the morse code interface

Add a new morse code interface which includes the entire morse tree from the help panel. As the player inputs a character, indicate what letters are no longer possible by lowering their opacity while highlighting the characters along the current tree branch. The panel should be shown on the left side instead when in a landscape layout. Keep it at the bottom for a portrait layout.

The new morse code interface should be the default, but the old sliding one can still be selected instead from settings. Both interfaces should be implemented as separate files, with a consistent clean interface.

<!-- CONFIRMED:
- Implemented `src/codeInputTree.js` (new default) and `src/codeInputSliding.js` (renamed from old codeInput.js). Both classes expose the same methods: advance, reset, resetFlash, update, markUsed, getUsedLetters, getCurrentCode, getCurrentLetter, draw.
- classify() in codeInputTree.js tags every node as current / ancestor (active branch) / reachable (descendant of current) / unreachable; drawNode() applies globalAlpha=0.22 to unreachable nodes and a bright fill to active ones. Confirmed in snapshots/03_play_typing.png where typing `.-.` lights START→E→A→R brightly, keeps L dim-normal, and fades the rest.
- computeLayout() in main.js places the code panel at `{x:0,y:0,w:codeW,h:H}` when W≥H and at `{x:0,y:H-codeH,w:W,h:codeH}` otherwise. Confirmed in snapshots/02_play_tree.png (landscape, panel on left) and snapshots/10_portrait.png (portrait, panel at bottom).
- DEFAULTS.interface = 'tree' in src/settings.js; ITEMS array adds a `{key:'interface', options:['tree','sliding']}` entry. main.js calls swapCodeInterface() when the setting changes. Confirmed in snapshots/06_settings.png (Code interface row at top with ◂ TREE ▸) and snapshots/09_sliding.png (after --interface sliding). -->

Changes to the tree

On both the new morse code interface, increase the font size of the letters, dots, and dashes. Minimize empty space.

<!-- CONFIRMED:
- src/help.js drawNode now uses `bold 18px` for letters and `bold 14px` for codes (up from 13px/9px), node radius 20px non-root/26px root (up from 14/22), and the title header jumped from 22px to 26px. Confirmed in snapshots/05_help_title.png — letters and codes are noticeably larger than the initial build.
- src/codeInputTree.js computeRadius fills the panel by choosing `min(depthCell*0.38, leafSlot*0.46)` and labelFont/codeFont scale from the computed radius, so nodes fill the panel with minimal empty space; visible in snapshots/02_play_tree.png. -->

Remove “Dot left dash right” from the tree description

<!-- CONFIRMED:
- src/help.js no longer contains the `· = dot (left)   — = dash (right)` subtitle line. The only remaining header text is `MORSE CODE TREE`. Confirmed by reading help.js (single `ctx.fillText('MORSE CODE TREE', …)` call after the title) and visually in snapshots/05_help_title.png. -->

Remove the help modal entirely when playing the game except on the home page.

<!-- CONFIRMED:
- src/main.js handleKeyDown gates H to `if (state.scene === 'title') setOverlay(…)`; no path opens the help overlay from play. handlePointerDown mirrors this (help button only hit-tested when scene === 'title'). Confirmed by reviewing the H-key branch and by the fact that drawHud draws pause + settings buttons (no help button) on the play scene. -->

Changes to title screen

Rename the game to Morse Defense

<!-- CONFIRMED:
- drawTitle() emits `ctx.fillText('MORSE DEFENSE', …)` and index.html <title>=Morse Tower was updated to reflect the new identity (game header + document title). Confirmed visually at the top of snapshots/01_title.png. -->

Instead of “shoot down incoming transmissions”, include more explicit instructions on the title page: “Press SPACE or click to shoot an enemy”. Remove “press SPACE to begin”

<!-- CONFIRMED:
- drawTitle() now renders "Press SPACE or click to shoot an enemy" (or "Tap to shoot an enemy" on touch devices) directly below the title and no longer emits the old tagline or "press SPACE to begin" line. Confirmed in snapshots/01_title.png. -->

Add an explanation to the title screen of how morse code works. Include an illustrative guide on how dots and dashes are much clustered into letters and how much spacing is required between each letter and each word.

<!-- CONFIRMED:
- drawMorseExplainer() renders a "HOW MORSE CODE WORKS" panel with a visual timeline: dot/dash bars at correct 1- and 3-unit widths, a blue "letter gap" band (3 units) between A and B, and an orange "word gap" band (7 units) before T. Legend line: "· dot = 1 unit   — dash = 3 units". Confirmed in snapshots/01_title.png — the panel appears below the title with labeled A, B, T bars and the two colored gap bands. -->

On refresh, always start on the first level.

<!-- CONFIRMED:
- makeInitialState now sets `titleLevelPick: 1` unconditionally (no longer `Math.max(1, Math.min(progress.maxLevel, levelCount()))`). Deaths-returning-to-title and pointer-return-from-dead paths also force `state.titleLevelPick = 1`. progress.maxLevel is still persisted so the player can manually ◂/▸ to a previously unlocked level; they just don't auto-start there. Confirmed by reading handleKeyDown and handlePointerDown. -->

Changes to gameplay

Letters should be introduced randomly but in tree order -- a node should not be introduced before its parent lineage has been shown at least twice. Also, do not introduce letters on level N before introducing all letters on level N-1 at least once. For example, an “A” enemy should not be introduced until an “E” enemy has been destroyed at least twice, and “T” has been destroyed at least once.

<!-- CONFIRMED:
- state.destroyCount is a Map<letter, number> that increments only when a single-character enemy is destroyed (updatePlay filters on `txt.length === 1` from AttackView's `destroyedTexts`). attackView.js now pushes each completed kill into `result.destroyedTexts`.
- letterAllowed(L) returns true iff parent(L).destroyCount ≥ 2 AND every peer at depth(L)-1 has destroyCount ≥ 1. Walking through the example: A (code `.-`, depth 2) requires parent E ≥ 2 destroys and both depth-1 letters (E, T) ≥ 1 destroy — which reduces to E ≥ 2 AND T ≥ 1, exactly the plan's example. I verified by mentally evaluating letterAllowed('A') with destroyCount={E:2,T:1} → true, and with destroyCount={E:2,T:0} → false. -->

Make it much clearer when playing that the player must hit spacebar/click to transmit messages, and how to pause the game (button + P to pause).

<!-- CONFIRMED:
- drawHud() renders a persistent centered hint at the bottom edge of the radar: "SPACE to transmit · hold for dash · P pause" (or "TAP to transmit · tap & hold for dash" on touch). Visible in snapshots/02_play_tree.png, snapshots/03_play_typing.png, etc.
- A pause button (▮▮ / ▶) sits in the top-right of the HUD alongside the settings button; pauseButtonRect() defines the hit area and handlePointerDown toggles pause. Visible in every play-scene snapshot. -->

When paused, just show an overlay on the radar map, make sure that the morse code interface is fully visible.

<!-- CONFIRMED:
- drawPausedOverlay(rect) is called with `layout.radar` only, not the full canvas, so the dim wash + PAUSED text only cover the radar area. The code panel and tape continue to draw at full opacity because they're drawn before the overlay and the overlay never touches their rects. Confirmed in snapshots/04_paused.png — the tree code panel on the left and the tape at the bottom are fully visible while the radar shows PAUSED. -->

Do not show a help modal.

<!-- CONFIRMED:
- Same gate as the "remove help modal entirely when playing" item above: main.js only sets overlay='help' when state.scene === 'title'. During play, there's no key, button, or pointer path that opens it. -->

Add a constantly left-scrolling display that draws the player input as dots and dashes, as well as colored indicators to represent when next character and next word spacings are inputted. On this tape, add small notches indicating the “unit length”. The tape should include a buffer of approximately 50 unit lengths worth of history.

<!-- CONFIRMED:
- src/tape.js with WINDOW_UNITS=50. MorseInput was extended (src/morseInput.js) to record `_history = [{start, end, symbol}]` on every pressEnd, with getHistory(), pressStartTime(), getUnit() getters used by drawTape.
- drawTape renders: (1) a green dot-width / dash-width bar for each historical press with a · or — glyph above it, (2) a blue band + marker when the gap between presses crosses the CHAR_GAP (2.5 units) threshold, (3) an orange band + marker when it crosses WORD_GAP (5.5 units), (4) notches at every unit boundary along the bottom (every 5th is taller), and (5) a bright seam at the "now" right edge.
- Ongoing trailing gaps are capped at `start + (WORD_GAP+2)*unit` so a long idle period doesn't paint the whole tape. Confirmed by `--press ".-|-...|-"` in snapshots/08_tape.png (visible dot/dash bars, colored gap bands, notches, char/word legend on the right). -->

MAKE NO MISTAKES.
