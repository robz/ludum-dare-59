The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)


Changes to title screen

The title screen is too cluttered. Move the “How morse code works” box into the help modal. Make sure the help modal includes the tree as well. And enable the help modal during gameplay as well. 

The “How morse code works” explanation is also very unclear. The graphical diagram should be higher quality and clearly point out the regions being labeled. Develop 4 different possible explanations. I should be able to cycle through each one with an arrow key. I will tell you on the next update which one to use.

The level arrows should be clickable (currently clicking on them starts the game)

Replace the ? and * text buttons with “Help” and “Settings” and make the font bigger.

Changes to gameplay

The dynamic unit length estimates are not working well. Try to fix it by measuring the distance between key down events within a character instead of what it’s currently measuring. Key down events should occur roughly 2 unit lengths apart for a dot (1 unit for the dot put 1 unit of space) and 4 unit lengths apart for a dash (3 units for the dash plus 1 unit of space).

Start with 100ms as the default unit length, with cutoffs for the next unit up placed at 0.8 unit lengths. e.g. If the unit length is measured to be 100ms, the cutoff between dots and dashes should be placed at 0.8 * 3 units * 100ms = 240ms. Similarly, the cutoff between a character delimiter wait and a word delimiter wait should be placed at 0.8 * 7 units * 100ms = 560ms. Add this “cutoff” parameter into the settings, and allow a slider range between 0.5 and 1.0.

When showing a multi-character word, make sure the player has already seen each of the letters making that word at least once. If you find that they haven’t been shown one of the letters, then give them just that letter instead of the whole word.

Currently, the game always fires one character at a time. Instead, change this to firing at a word termination (7 unit lengths of time). This makes it so that words must be completed altogether as one word, rather than single characters. Don’t allow character-by-character completion for words.

Instead of simple level numbers (“LV 5 - Level 5 - Signals”), change the levels to be represented by naval ranks: seaman, petty officer, chief petty officer, warrant officer, ensign, lieutenant, lieutenant commander, commander, captain, admiral. Include insignia icons. (“LV 5 - Ensign - <insignia>”)

After each level, show a message congratulating the player on a promotion. The first time this message is shown, make it an intrusive modal box with clear instructions and accept/decline buttons, and for subsequent messages, make it just an unobtrusive overlay. Give them the option to accept the promotion, or stay on their current rank. Clicking accept or pressing enter will accept the promotion and lead them to the next level. Clicking delete/backspace or “decline” will allow them to stay on the current level indefinitely, but they can accept at any time to be promoted by pressing enter.

Remove the “TRANSMIT” text in the top right

Changes to timeline view

The timeline view is confusing. Just draw the times for dots/dashes, make it clear which is which, and don’t add lines or the highlighted regions, and never rescale the dot/dashes. 

If a letter was transmitted, write it on the timeline as well, making it large and visible.

Changes to the tree

When visiting each node of the tree, show a dial, which is behind the node and protrudes 50% beyond it. In the landscape layout, it starts pointing vertically up, sweeps clockwise when space is pressed, and ends vertically down as long as space is pressed. It should arrive midway (at the 3 o’clock position) when crossing the boundary between registering a dot and a dash. If a dot would be registered on keyup, the line to the next dot node should be lightly highlighted. After passing the threshold, the line from the node to the dash node should be lightly highlighted instead. The dial should disappear after keyup. In the portrait layout, it should start pointing left and sweep counter clockwise.

In portrait mode, the last column/row of letters in the tree is overcrowded and you cannot see the dashes and dots for them. Instead, add dashes and dots inside the letter circles. Make sure they are not cut off and are clearly visible.

