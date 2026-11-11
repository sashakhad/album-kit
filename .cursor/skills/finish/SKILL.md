---
name: finish
description: Use when the owner reviews which takes play on Listen.
---

# Finish · version 4

Compare takes is where the owner listens, scores, and controls which take plays on Listen. The highest positive owner score plays by default. Every take tied for that score plays in album order. A track with no positive score can still play as a preview for someone with comparison access.

## When to use

- The owner is done judging a track or the whole album.
- The owner wants to review the scored versions or choose a different take on `/listen`.

## Steps

1. Open Compare takes in the owner’s session. For a private chat handoff, run `pnpm owner:link /vote` in the album checkout. The owner taps **Continue as owner** and lands on Compare takes. Do not paste the permanent album key into chat.
2. The highest scores appear first for each track. The On Listen line shows the takes listeners will hear.
3. To choose a specific take, select it and click **Use Take A on Listen** (with the selected letter). **Follow scores** clears that choice and returns to automatic selection. The server resolves blind aliases. A saved choice overrides file-backed picks in `album/album.json`.
4. Open `<siteUrl>/listen` and verify that the chosen track plays. For a public site, check without the key that pinned audio plays and an unpinned canonical take does not. For a private site, check with a valid invited-listener session; signed-out pages and audio must stay closed.
5. Share `<siteUrl>/listen` for the album or `<siteUrl>/listen/<slug>` for one track.

If the owner asks to version the final choices in `album/album.json`, update the file only after the canonical identity has been deliberately revealed, then follow `publish`. A file update alone does not replace a choice already saved on `/vote`; reconcile the site choice too.

## Check before you say done

- The On Listen line in Compare takes shows the intended take or tied takes.
- `/listen` shows the selected track, and the audio access check matches public or private visibility.
- The site URL you share is the production URL from `.album-site.json`.

## Stop and ask when

- The owner requests a manual choice and their words could mean more than one take.
- The requested take is out or parked. Confirm before changing the shortlist.
- An unpinned canonical `/api/audio/` URL answers `200` without the key. Authorized opaque preview URLs are expected to play. Do not share the link until access is fixed.
