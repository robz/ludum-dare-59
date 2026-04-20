The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)


Let’s just give up on the dynamic timing system. Make the unit length default to 100ms and allow it to be manually adjusted with a slider jar within a range of 40ms to 400ms in the settings. Clean up all dynamic timing system code.

The first time character introduction tooltip is too large. Make it smaller.

Revert the change to the player’s score -- calculate it how it was in v3 (see git commit history to verify)

Display the player’s current score. The floating tooltip for score increases currently displayed at the top right should instead be displayed at the location of the event providing the score increase. E.g. over the enemy as it dies.

Add a key in the first card of the help page for what 1 unit is, based on the current value “1 unit = 100 ms (adjust in settings)”

Double the text size of all text in the gameplay page. Also add text size as a setting.

Add a light radar sweep graphical effect as the radar dial rotates

Remove the “Timeline” text

Replace the “Level 3 -  Short words” etc with just “Short words”

Don’t capture keyboard modifiers like command control etc


MAKE NO MISTAKES

