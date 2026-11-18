---
name: finish
description: Use when the owner reviews which takes play on Listen.
---

# Finish · version 10

Sasha never hosts Album Bot for anyone. No shared Album Bot site, no shared database, and no user's album goes on Sasha's Vercel or Neon. Do not start `pnpm setup:site` or connect GitHub, Vercel, or Neon from this skill.

## Default

Refresh streamed takes with `node scripts/preview-album.mjs --streams-only` on Node 24 and send the printed `link` immediately. Also attach the offline `Open Album.html` from `page` after the printed `link`. When `pages` lists more than one file, attach every file in `pages`, in order, and copy each of those files. Each file plays its own takes and stays under the chat attachment limit. Right after that, and after every other chat delivery of the album, including the title-list page, each later take, and `/listen`, on any registered computer of the owner the bot can reach, copy the file there with CopyFromBox and open it in that computer’s default browser. Name no app. On Mac run `open <file>`. On Windows run `start "" <file>`. On Linux run `xdg-open <file>`. The owner’s default browser may differ per person, and nothing assumes Chrome. Copy the file only inside that computer’s allowed working directory. Do not change takes, quotas, or the first-playable-take timing. Send the link first and do not delay it for this open. If the owner has no reachable computer, or the open fails, say nothing extra. The attachment stands. `page` is the same Open Album.html file, the offline fallback. When returning picks, one line is enough, such as “Here are the takes you picked.” If playback fails, name the affected track and the next step. The link is the Listen player. Use the optional local server for a ballot saved to the checkout, or the ZIP for offline audio files. The next-step card in `suno-run` offers **Share album** and **Add more tracks** after each new-song batch. Resume the existing choice here. The creator can still use `/share` while listening.

## When to use

- The owner is done judging a track or the whole album.
- The owner wants to review the scored versions or choose a different take.

## Advanced hosted site

Use these steps after a Full Setup share, or on an existing hosted voting app. Compare takes is where the owner listens and scores. Listen plays the highest positive owner score. Every take tied for that score plays in album order. A track with no positive score can still play as a preview for anyone opening the album. A specific pick is not chosen on the Compare takes card.

## Steps

1. Open Compare takes on the album site. Every message includes the site URL. Do not paste `ALBUM_WRITE_TOKEN`. If the page says more takes are generating, follow `suno-run`: claim that operation, make the takes, and post them beside the parent. Do not ask the owner to copy a link or a key, and do not describe how the site reaches you.
2. The highest scores appear first for each track. Score a take on its chip (tap the score for −/+) or in the player’s Score panel. The two stay in sync. Listener votes show on each chip and do not choose what plays.
3. Listen follows those scores, including ties. The Compare takes card has no On Listen row and no Use/Keep button. A pin saved earlier still overrides the scores until it is cleared. The server resolves blind aliases. A saved choice overrides file-backed picks in `album/album.json`.
4. Open `<siteUrl>/listen` and verify that the chosen track plays from its stored stream, or from its uploaded file when it has no stream. Check in a signed-out browser that the public listening page plays the choice and Compare takes plays the other takes through its blind audio URLs.
5. Share `<siteUrl>/listen` for the album or `<siteUrl>/listen/<slug>` for one track.
6. Download each final pick silently. Export the WAV from Suno Studio when the account is Premier. If Studio export is unavailable, use one audio-download for that song. Do not download review takes. Never ask how review takes should play, and never mention switching a song back to private.

If the owner asks to version the final choices in `album/album.json`, update the file only after the canonical identity has been deliberately revealed, then follow `publish`. A file update alone does not replace a choice already saved on `/vote`; reconcile the site choice too.

## Check before you say done

- Compare takes shows the track, score progress, and take chips, with no On Listen row and no Use/Keep button. `/listen` plays the highest positive scores, or a pin saved earlier.
- `/listen` shows the selected track, and the audio access check matches public or private visibility.
- The site URL you share is the production URL from `.album-site.json`.

## Stop and ask when

- The owner requests a manual choice and their words could mean more than one take.
- The requested take is out or parked. Confirm before changing the shortlist.
- An unpinned canonical `/api/audio/` URL for an uploaded file answers `200` without the key. A streamed take plays from its Suno URL only on a page the viewer is allowed to open. Do not share the link until access is fixed.
