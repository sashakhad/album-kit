---
name: finish
description: Use when the owner is ready to choose album or VIP takes for Listen.
---

# Finish · version 3

The owner picks the keepers. `/final` is the owner screen for making those choices. A pick replaces that track’s Preview on `/listen` as soon as it is saved. Before a pick exists, listeners with comparison access can play the first current take; that preview is never a saved winner. Never choose a winner just because it has the highest score.

## When to use

- The owner is done judging a track or the whole album.
- The owner wants a different take on `/listen`, an optional VIP, or a final pass over the scores.

## Steps

1. Open Final picks in the owner’s session. For a private chat handoff, run `pnpm owner:link /final` in the album checkout. The owner taps **Continue as owner** and lands on Final picks. Do not paste the permanent album key into chat.
2. Show the owner the takes and scores. Suggest a top-scoring take when helpful, but let the owner make the choice. The Final picks page can play each active take and shows owner scores and listener scores separately.
3. Use **Make album pick** for the chosen main take and **Make VIP** only for a chosen second version. The page resolves blind aliases on the server; never guess the canonical letter from a blind label. Picks saved here override any older pins in `album/album.json`. Removing a pick in the page also overrides a file-backed pin.
4. Open `<siteUrl>/listen` and verify that the chosen track plays. For a public site, check without the key that pinned audio plays and an unpinned canonical take does not. For a private site, check with a valid invited-listener session; signed-out pages and audio must stay closed.
5. Share `<siteUrl>/listen` for the album or `<siteUrl>/listen/<slug>` for one track.

If the owner asks to version the final choices in `album/album.json`, update the file only after the canonical identity has been deliberately revealed, then follow `publish`. A file update alone does not replace a choice already saved on `/final`; reconcile the site choice too.

## Check before you say done

- The selected take is marked **Album pick** or **VIP picked** on `/final`.
- `/listen` shows the selected track, and the audio access check matches public or private visibility.
- The site URL you share is the production URL from `.album-site.json`.

## Stop and ask when

- The owner has not chosen a take, or their words could mean more than one take.
- The requested take is out or parked. Confirm before changing the shortlist.
- An unpinned canonical `/api/audio/` URL answers `200` without the key. Authorized opaque preview URLs are expected to play. Do not share the link until access is fixed.
