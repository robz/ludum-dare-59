This is a web game with html/js to learn morse code. Structure it like a typical typing game, except for morse code. Include sound and visual effects.

The player has to enter a code to send a transmission from the radio tower to a turret, in order to shoot down an incoming enemy labels with the given letter

Code interface

The code interface allow the user to traverse a tree, dots traversing to the left and dashes to the right: https://upload.wikimedia.org/wikipedia/commons/1/19/Morse-code-tree.svg 

Initially only “Start” text is shown, with “E” on the left and “T” on the right. If the user taps on the spacebar (or just taps on the screen on mobile), a dot is entered. “Start” slides off to the right off screen, and E slides into place in the center, with I and A shown on the left and right respectively. If the user then enters a dash (holding/tapping longer), then E slides off to the left, “A” slides into center, and “R” and “W” are shown beside it, etc.

Make sure to implement the code interface as a separate file, so that it can be swapped out/reused easily in the future. There should be an ultraclean interface to the file from main.js. Note this interface should also be independent of code input handling.

After sending a transmission to the turret, if there is a matching enemy on the field, it will shoot and destroy the enemy, otherwise do nothing (provide some light feedback for failure)

If the player presses any other key besides space or a hokey, a banner appears that says “Send transmissions with spacebar” (or “by tapping” on mobile)

Interpreting Codes

In order to facilitate a high quality-of-life player experience, make sure the timing system reading player inputs and converting them from morse code into letters includes reasonable tolerances on the input timings. Typical morse code timing requires 1 unit length for a “dot”, 3 units for a “dash”, 1 unit for a space within a character, 3 units for a space between characters, and 7 units for a space between words. Since this game is targeting beginner players, they should not be expected to type too fast. Create a system which dynamically estimates the time duration for one “unit” based on player input. For now, start this estimate out at 200ms, which is very slow, but we may need to tweak this value in the future after testing. For testing and debugging, show this duration somewhere on the page.


Attack view

The main view is a radar indicator with a dial sweeping radially over it, lighting up incoming enemies which can come from any direction (shown as letters) and missiles sent to destroy enemies. Use https://commons.wikimedia.org/wiki/File:Radar_Graphic.svg as inspiration.

Make sure to implement the attack view as a separate file, so that it can be swapped out/reused in the future. There should be an ultraclean interface to the file from main.js

If an enemy reaches you, then you incur damage. There’s a health bar indicating how many hits you have taken.

Escalating threats

Level one should include just single letters and last 90 seconds. Letters should be introduced randomly but in tree order -- a node should not be introduced before its parent lineage has been. For example, an “A” enemy should not be introduced until an “E” enemy has been destroyed.

Level two should begin mixing in 2-3 letter English words and common acronyms relevant to morse code, such as “SOS”. Level three should begin mixing in 3-4 letter words. Repeat this pattern up until level 8-10, or whatever is reasonable. 

In order to facilitate this, construct separate dictionary files relevant to each level, encoded in a formatted json file “src/levels.json”. On the title screen, include a level select option where the player can choose to replay starting from the highest level they’ve reached. While testing, allow entering a number (1-9) to instantly start at the given level.

Dying

When you die, show a leaderboard screen with how many enemies you’ve destroyed and your CPM (character per minute) rating for that round

Testing

Ensure that snapshot.js can take screenshots of the game at various levels (add other params to be able to view the game in any situation, just as with the help or settings page is visible). Use es6 modules to import main directly, and make sure that when taking snapshots the same logic to render the game in the browser (all coloring, sizing, etc)  is tested.


Help interface

Pressing H or a help button on the page will bring up a modal with the morse code tree: https://upload.wikimedia.org/wikipedia/commons/1/19/Morse-code-tree.svg 

The code tree should be stylized like the rest of the game’s interface, where nodes are slightly highlighted if they’ve already been used to kill an enemy. 

Settings

Hitting S or a Gear button opens the dev/settings menu. Whenever any setting is changed, it is saved via localstorage. The default (hardcoded) values are indicated as well. It contains the following:
Hits required to die
Initial “unit” duration
Any other settings that devs will need to tweak the feel/flow of the game


MAKE NO MISTAKES!

