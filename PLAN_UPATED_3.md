The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)

Title screen

Add “Tap briefly for dots and longer for dashes” as an extra line under the “Press space…” text on the title screen.

Gameplay


The dynamic unit time calculations have gotten worse. It appears to be lengthening the estimated unit when it should be shortening them. I didn’t look at the code, but it feels like it might be inputting double the actual measured length into the filter. Fix this by halving the measured interval.

The first time a letter is shown to the player, add an extra tooltip that shows the dots and dashes required to make that letter. Make it extra large and easy to read.

Replace text “send transmissions with spacebar” with “Spacebar to signal” 

Instead of “press P or SPACE to resume” in Paused menu, say “Tap to resume” on mobile.

Instead of “SPACE to transmit - hold for dash - P pause” say
SPACE for dot - hold longer for dash - P pause
And on mobile say “Tap” instead of “Space” (Make sure this is consistent throughout the entire app)

Display a small floating tooltip as the player score increases

Timeline view

Have both letters and blocks take full height on the bar

Help modal

Drop the 3rd and 4th parts, keep the 1st and 2nd. Add an explicit text at the top of the modal that says “Tap to send a dot . Hold down longer to send a dash -”

Change the example on the first to be “a tv” -- and make sure the word gap really is 7 units, at the moment it is not to scale

End game modal

Instead of “Transmission Lost” set the title to “Mission Failed”

Move CPM below Time survived

Move “Level reached” under “Enemies destroyed”

The player’s score just be CPM

Show the player’s rank amongst all other playthroughs

“Remove Deepest level”

Instead of “press SPACE or ENTER to return to title” just say “tap to return to title”


MAKE NO MISTAKES

