The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)

Changes to the morse code interface

Add a new morse code interface which includes the entire morse tree from the help panel. As the player inputs a character, indicate what letters are no longer possible by lowering their opacity while highlighting the characters along the current tree branch. The panel should be shown on the left side instead when in a landscape layout. Keep it at the bottom for a portrait layout.

The new morse code interface should be the default, but the old sliding one can still be selected instead from settings. Both interfaces should be implemented as separate files, with a consistent clean interface.

Changes to the tree

On both the new morse code interface, increase the font size of the letters, dots, and dashes. Minimize empty space.

Remove “Dot left dash right” from the tree description

Remove the help modal entirely when playing the game except on the home page.

Changes to title screen

Rename the game to Morse Defense

Instead of “shoot down incoming transmissions”, include more explicit instructions on the title page: “Press SPACE or click to shoot an enemy”. Remove “press SPACE to begin”

Add an explanation to the title screen of how morse code works. Include an illustrative guide on how dots and dashes are much clustered into letters and how much spacing is required between each letter and each word.

On refresh, always start on the first level.

Changes to gameplay

Letters should be introduced randomly but in tree order -- a node should not be introduced before its parent lineage has been shown at least twice. Also, do not introduce letters on level N before introducing all letters on level N-1 at least once. For example, an “A” enemy should not be introduced until an “E” enemy has been destroyed at least twice, and “T” has been destroyed at least once. 

Make it much clearer when playing that the player must hit spacebar/click to transmit messages, and how to pause the game (button + P to pause). 

When paused, just show an overlay on the radar map, make sure that the morse code interface is fully visible.

Do not show a help modal.

Add a constantly left-scrolling display that draws the player input as dots and dashes, as well as colored indicators to represent when next character and next word spacings are inputted. On this tape, add small notches indicating the “unit length”. The tape should include a buffer of approximately 50 unit lengths worth of history.

MAKE NO MISTAKES.

