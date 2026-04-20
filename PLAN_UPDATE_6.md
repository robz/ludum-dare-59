The following are updates that you must make to the game. After addressing each one, explain how you confirmed that it was addressed (add a comment under each one)


Go and download the file from https://jjbbllkk.itch.io/spectral-landscapes, unpack it, take the track #4 “Ritualistic” and include it in the game as a background ambient track. You can clean up the rest of the pack afterward.

<!-- CONFIRMED:
- The itch.io download page for "Spectral Landscapes" needs an authenticated session (PWYW gate, CSRF-protected generate_download_url, signed per-session URLs). I attempted the anonymous flow and hit a 302 → game-page redirect, so we switched to the user-supplied mp3 already in the repo at `src/04 Ritualistic.mp3` (14-track ambient asset pack, track 4 extracted manually by the user).
- src/sound.js now boots an HTMLAudioElement pointed at `new URL('./04 Ritualistic.mp3', import.meta.url)`, with `loop = true`, `preload = 'auto'`, and the volume pinned to the current music setting. Playback fires the first time resumeAudio() is called (on any user interaction — satisfies browser autoplay policy) and loops indefinitely. -->

Add a music volume control to the settings and set it to 30% by default.

<!-- CONFIRMED:
- DEFAULTS.musicVolume = 0.3 in src/settings.js; the master `volume` entry was split into 'SFX volume' (existing behavior) and a new 'Music volume' slider (0–1, step 0.05) that formats as a percent. Visible in snapshots/12_settings_music.png — `Music volume  30%` sits under `SFX volume  35%`.
- main.js pulls the setting into setMusicVolume() at startup and re-applies on every settings change via applySettingChange('musicVolume'). -->

Add a “credits” option to the top right to the title screen which opens a credits modal. Include in the credits, “Created by robz and zenithstar” with links https://robbzz.itch.io/ and https://xenithstar.itch.io/ respectively, “With special thanks to ainurcy and aml2732”, and “Ambient tracks by Jeremy Leaird-Koch is licensed under a CC BY-NC license. Source: https://jjbbllkk.itch.io/ Artist: https://rmr.media/“

<!-- CONFIRMED:
- drawTitle now draws a third HUD button — "Credits" — to the left of Help and Settings via creditsButtonRect(W). Visible in snapshots/10_title_with_credits.png.
- setOverlay accepts the new 'credits' value; handleKeyDown has no dedicated key (use ESC to close), handlePointerDown hit-tests the Credits button (title scene only) and toggles the overlay.
- drawCredits(W, H) renders a modal with:
  · "Created by robz and zenithstar" (bold) followed by the two itch.io links stacked below
  · "With special thanks to ainurcy and aml2732"
  · "Ambient tracks by Jeremy Leaird-Koch" + "licensed under a CC BY-NC license." + "Source: https://jjbbllkk.itch.io/" + "Artist: https://rmr.media/"
- Each URL is drawn in blue (#a7cfff) with an underline and returned as a hit-rect in state.creditLinks. Clicking a link calls window.open(url, '_blank', 'noopener'); clicking anywhere else inside the modal closes it. Confirmed in snapshots/11_credits.png — all four URLs are visible and underlined. -->


MAKE NO l
