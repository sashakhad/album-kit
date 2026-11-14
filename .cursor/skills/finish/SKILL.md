---
name: finish
description: Use when the owner reviews which takes play on Listen.
---

# Finish · version 6

Compare takes is where the owner listens, scores, and controls which take plays on Listen. The highest positive owner score plays by default. Every take tied for that score plays in album order. A track with no positive score can still play as a preview for someone with comparison access.

## When to use

- The owner is done judging a track or the whole album.
- The owner wants to review the scored versions or choose a different take on `/listen`.

## Steps

1. Open Compare takes in the owner’s session. For a private chat handoff, run `pnpm owner:link /vote` in the album checkout. Paste both the `Site:` line and the `Owner:` line. The owner taps **Continue as owner** and lands on Compare takes. Every message includes the site URL. The owner can also open Compare takes by entering their password at `/key`. Do not paste the owner password into chat or a query string.
2. The highest scores appear first for each track. The On Listen line shows the takes listeners will hear.
3. To choose a specific take, select it and click **Use Take A on Listen** (with the selected letter). **Follow scores** clears that choice and returns to automatic selection. The server resolves blind aliases. A saved choice overrides file-backed picks in `album/album.json`.
4. Open `<siteUrl>/listen` and verify that the chosen track plays from its stored stream, or from its uploaded file when it has no stream. For a public site, check without the key that pinned audio plays and an unpinned canonical file does not. For a private site, check with a valid invited-listener session; signed-out pages and the take list must stay closed.
5. Share `<siteUrl>/listen` for the album or `<siteUrl>/listen/<slug>` for one track.
6. When the owner wants a file of a final pick, export the WAV from Suno Studio (Premier; Studio exports do not count toward the 60/month download cap). If Studio export is unavailable, use one audio-download for that song. Do not download the other takes when they were streamed. The owner can switch a streamed song back to private on Suno later. A take that’s private on Suno stops playing on the site, so the best time is after picks are final, and only for takes that are no longer needed for listening. Final picks are stored as real files.

If the owner asks to version the final choices in `album/album.json`, update the file only after the canonical identity has been deliberately revealed, then follow `publish`. A file update alone does not replace a choice already saved on `/vote`; reconcile the site choice too.

## Check before you say done

- The On Listen line in Compare takes shows the intended take or tied takes.
- `/listen` shows the selected track, and the audio access check matches public or private visibility.
- The site URL you share is the production URL from `.album-site.json`.

## Stop and ask when

- The owner requests a manual choice and their words could mean more than one take.
- The requested take is out or parked. Confirm before changing the shortlist.
- An unpinned canonical `/api/audio/` URL for an uploaded file answers `200` without the key. A streamed take plays from its Suno URL only on a page the viewer is allowed to open. Do not share the link until access is fixed.
