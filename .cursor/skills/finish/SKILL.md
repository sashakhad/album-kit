---
name: finish
description: Use when the owner is done judging a track or the whole album. It pins the chosen takes to /listen, publishes and shares the link.
---

# Finish

The owner picks the keepers. You pin them to `/listen`, the page anyone can open, and share the link.

## When to use

- The owner is done judging a track, or the whole album.
- The owner wants a different take on `/listen` for a track, or a second version as a VIP.

## You need

- `~/album` with `.album-site.json` and `.album-key`.
- The owner's pick for each track. You suggest, and they choose.

## Steps

Run every command from `~/album`, after `SITE=$(node -p 'require("./.album-site.json").siteUrl')`.

1. **Suggest the top-scoring take that's still in,** for each track the owner is finishing:

   ```bash
   curl -sS -H "Authorization: Bearer $(cat .album-key)" "$SITE/api/votes" | node -e '
   const snapshot = JSON.parse(require("fs").readFileSync(0, "utf8"));
   const album = require("./album/album.json");
   const names = new Map(album.sets.map(set => [set.id, set.name]));
   console.log(`Round ${snapshot.currentRound}`);
   for (const track of album.tracks) {
     let top = 0;
     let leaders = [];
     for (const [set, takes] of Object.entries(snapshot.tallies[track.number] ?? {})) {
       for (const [take, score] of Object.entries(takes)) {
         if (score > top) {
           top = score;
           leaders = [];
         }
         if (score === top && score > 0) {
           leaders.push(`${names.get(set) ?? set} ${take}`);
         }
       }
     }
     console.log(`${track.number} ${track.title}: ${leaders.length > 0 ? `${leaders.join(", ")} at +${top}` : "no upvotes this round"}`);
   }
   '
   ```

   The scores are this round's, so a take that's out has none. A parked take can still show a score, so skip it if you parked it. Name the suggestion the way `/vote` does, like `Bubu C`, and let the owner pick. Never pin a take the owner didn't pick.

2. **Pin the pick.** On the track in `album/album.json`, add `"listen": { "set": "<set id>", "take": "<letter>" }`, with the letter in capitals. For a second version on `/listen`, add `"vip": { "set": "<set id>", "take": "<letter>" }` too. Its row is titled `<title> (VIP)` unless you add `"title"` to the `vip` pin with the name the owner wants.

3. **Publish.** Follow the `publish` skill with the message `pin track <NN>`.

4. **Check it the way a visitor would.** Without the key, the track's page and its pinned take answer, and any other take of that track doesn't:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' "$SITE/listen/<slug>"
   curl -sSL -o /dev/null -w '%{http_code}\n' "$SITE/api/audio/<set>/<pinned file>"
   curl -sSL -o /dev/null -w '%{http_code}\n' "$SITE/api/audio/<set>/<an unpinned file>"
   ```

   You want `200`, `200`, then `401`. Take the filenames from the track sheet's Canonical files table.

5. **Share the link:** `<siteUrl>/listen` for the album, and `<siteUrl>/listen/<slug>` for one track.

## Check before you say done

- The `publish` skill's checks passed.
- Step 4 printed `200`, `200` and `401`.
- Open `<siteUrl>/listen` in your browser, which isn't signed in as the owner. Each pinned track is there in track order, a VIP row follows its own track, and tracks without a pin aren't there.

## Tell the user

- The `/listen` link, and each pinned track with its take, like `Plant Bass'd: Bubu C`.
- Anyone with the link hears only the pinned takes. Every other take stays unlisted.

## Stop and ask when

- The owner hasn't picked a take for a track.
- The pick is out or parked. Confirm it before you pin it.
- Two takes tie, or no take has an upvote.
- An unpinned take answers `200` without the key. Don't share the link, and tell the user.
