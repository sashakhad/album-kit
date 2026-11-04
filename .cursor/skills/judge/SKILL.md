---
name: judge
description: Use while the owner votes on /vote, to explain or start rounds, park a take, or promote, extract or rename takes. It also frees up storage when the album runs low on space.
---

# Judge

The owner judges. You explain the rounds, keep the files straight and move takes when the owner asks. You never vote, and you don't volunteer which prompt or model made a take.

## When to use

- The owner asks how voting and rounds work, or wants the next round.
- The owner wants a take parked, promoted or extracted into its own track, or a track renamed.
- Storage is a concern: more than 150 takes are stored, or an upload failed for lack of space.

## You need

- `~/album` with `.album-site.json` and `.album-key`.
- The track sheets in `album/tracks/`, which hold every take's filename.

## Steps

Run every command from `~/album`, after `SITE=$(node -p 'require("./.album-site.json").siteUrl')`.

1. **Know how rounds work,** and explain it this way when the owner asks:
   - You vote on `/vote`, signed in with the album key. Each take shows as its set's name and its letter, like `Bubu C`. Nothing on the page says which prompt or model made it.
   - Round 1 shows every take.
   - A vote adds +1 or -1 to the take's score for the current round, starting from whatever score carried over.
   - From round 2 on, a take is out if it ended an earlier round with a negative score, and a parked take moves under Possible renames.
   - When a new round starts, each take's latest positive score carries into it. Zero and negative scores don't carry. Takes at zero and takes with no votes stay in.
   - Only the owner starts the next round, with the Next round button on `/vote` or by asking you.

2. **Read the scores.**

   ```bash
   curl -sS -H "Authorization: Bearer $(cat .album-key)" "$SITE/api/votes"
   ```

   The answer has `currentRound`, and `tallies`: track number, then set id, then letter, then the score this round.

3. **Start the next round,** only when the owner says so. Read the scores first, so you can say how many takes the new round drops.

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $(cat .album-key)" -H 'Content-Type: application/json' -d '{"action":"next"}' "$SITE/api/pass"
   ```

   It answers with `currentRound` and the new scores.

4. **Find a take's file.** The owner names a take the way `/vote` shows it: a track and `<set name> <letter>`. Get the set's id from `sets` in `album/album.json`, then the file from the track sheet's Canonical files table.

5. **Park or unpark a take.**

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $(cat .album-key)" -H 'Content-Type: application/json' -d '{"file":"<file>","parked":true}' "$SITE/api/owner/takes/park"
   ```

   It answers `{ "file": "<file>", "parked": true }`. From round 2 on, a parked take leaves the main list and sits under Possible renames, where the owner can still play it. Send `"parked": false` to bring it back.

6. **Promote or extract a take into its own track.** In this order:
   1. Agree on the new title with the owner. The new number is the highest number in `album/album.json` plus one. Get the slug:

      ```bash
      node --no-warnings -e 'import("./src/lib/album/slug.ts").then(m => console.log(m.slugifyTrackTitle(process.argv[1])))' "<Title>"
      ```

   2. Add `{ "number": <n>, "title": "<Title>", "slug": "<slug>" }` to `tracks` in `album/album.json`, then follow the `publish` skill with the message `add track <NN> <title>`.
   3. Move the take. The new name keeps the set and the prompt, and takes the new track's next free letter, starting at A. Move several takes one at a time, in letter order:

      ```bash
      curl -sS -X POST -H "Authorization: Bearer $(cat .album-key)" -H 'Content-Type: application/json' -d '{"from":"v1-03-old-title-p2-takec.mp3","to":"v1-24-new-title-p2-takea.mp3"}' "$SITE/api/owner/takes/move"
      ```

      It answers with `votesMoved`, `downloadsMoved`, `sightingsMoved` and `parkedMoved`, so the take keeps its votes. Add `"keepSource": true` only if the owner wants the take to stay on its old track too. Its votes still move, so the copy on the old track starts again with no votes.

   4. Update the sheets. In the old track's sheet, keep the take's row and add a line under the table, like `C moved to track 24 as A.` The old track keeps that letter as a gap, so it's never reused. Give the new track a sheet at `album/tracks/<NN>-<slug>.md` with the title as its heading, the line `Track <NN>. Set <set id> (<set name>). Moved from` and the old file's name in backticks, and a Canonical files table with the moved take.
   5. Follow the `publish` skill with the message `track <NN> sheet`.

7. **Rename a track.** The number stays. In this order:
   1. Agree on the new title. Get the new slug with the command in step 6.
   2. Change the track's `title` and `slug` in `album/album.json`. Rename its sheet and synthesis note with `git mv` to the new slug, then change the sheet's heading, its Title field and every filename in its table to the new slug.
   3. Follow the `publish` skill with the message `rename track <NN> to <title>`.
   4. Move each take from its old name to its new name with a plain move. Never add `replace` or `keepSource` to a rename. The route refuses `keepSource` on a rename with 400, because a rename always moves the file:

      ```bash
      curl -sS -X POST -H "Authorization: Bearer $(cat .album-key)" -H 'Content-Type: application/json' -d '{"from":"v1-08-old-title-p1-takea.mp3","to":"v1-08-new-title-p1-takea.mp3"}' "$SITE/api/owner/takes/move"
      ```

      It answers with `votesMoved: 0`. That's expected: votes belong to the set, number and letter, which don't change, so every vote stays with its take.

8. **When a letter is taken.** A move answers 409 when the letter you picked is already used on that track.
   - `destination file exists`: pick the track's next free letter.
   - The take `already exists as` another file: a file with a different name already holds that letter. Pick the next free letter after the last one in the track's sheet. Letters are never reused.
   - `destination has votes`: pick the next free letter too, so nothing gets deleted. If the owner wants this take to take over that letter, tell them exactly which votes go: the track, the take as `<set name> <letter>`, and the count from the answer's `votes`. Only after a yes, run the move again with `"replace": true` added. That deletes those votes and downloads.

9. **Free up storage.** Offer this only when storage is a concern: more than 150 takes are stored, or an upload failed for lack of space. Never offer it as a routine after a round. Offer it once. If the owner says no, note that in `album/GENERATION-LOG.md`, and don't offer again until an upload fails for lack of space or they ask.
   1. Count the takes stored:

      ```bash
      npx --yes vercel blob list --prefix takes/ --limit 1000 --json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).blobs.length'
      ```

   2. Remind the owner first that downvoted takes sometimes become new songs. Promote one before it's deleted.
   3. List the takes that are out: those that ended an earlier round with a negative score. This leaves out every parked take and every take pinned to `/listen`:

      ```bash
      node --env-file=.env.local -e '
      const { Client } = require("pg");
      const { list } = require("@vercel/blob");
      const album = require("./album/album.json");
      (async () => {
        const keep = new Set();
        for (const track of album.tracks) {
          for (const pin of [track.listen, track.vip]) {
            if (pin) keep.add(`${pin.set}|${track.number}|${pin.take}`);
          }
        }
        const db = new Client({ connectionString: process.env.DATABASE_URL });
        await db.connect();
        const { rows } = await db.query(`SELECT DISTINCT v."versionSlug", v."trackNumber", v."takeLabel" FROM "Vote" v JOIN "VisitorRound" r ON r."visitorId" = v."visitorId" WHERE v."visitorId" = $1 AND v."value" < 0 AND v."round" < r."currentRound" AND NOT EXISTS (SELECT 1 FROM "ParkedTake" p WHERE p."versionSlug" = v."versionSlug" AND p."trackNumber" = v."trackNumber" AND p."takeLabel" = v."takeLabel")`, ["owner"]);
        await db.end();
        const out = new Set();
        for (const row of rows) {
          const key = `${row.versionSlug}|${row.trackNumber}|${row.takeLabel}`;
          if (!keep.has(key)) out.add(key);
        }
        let cursor;
        do {
          const page = await list({ prefix: "takes/", cursor });
          for (const blob of page.blobs) {
            const name = blob.pathname.slice("takes/".length);
            const m = /^(v\d+)-(\d{2})-.+-take([a-z]{1,2})\.mp3$/.exec(name);
            if (m && out.has(`${m[1]}|${Number(m[2])}|${m[3].toUpperCase()}`)) console.log(name);
          }
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
      })();
      '
      ```

   4. Show the owner the list as track titles and `<set name> <letter>`, and get a yes for all of it or for the ones they pick.
   5. Delete only those files from storage:

      ```bash
      npx --yes vercel blob del takes/<file> takes/<file> --yes
      ```

      Their votes stay in the database, and the takes stop showing on `/vote`. Keep their rows in the sheets: their letters stay used, so a new take never inherits their votes. Local copies in `album/audio/` stay where they are.

## Check before you say done

- Each call answered as this skill says: the scores, the new round, `{ file, parked }` or the move's counts.
- After a move, the new file plays for the owner and the old name is gone, unless you kept the source:

  ```bash
  curl -sSL -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat .album-key)" "$SITE/api/audio/<set>/<new file>"
  curl -sSL -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat .album-key)" "$SITE/api/audio/<set>/<old file>"
  ```

  You want `200`, then `404`.

- Changes to `album/album.json` and the sheets went through the `publish` skill, and its checks passed.
- After a cleanup, the storage count dropped by the number of files you deleted.

## Tell the user

- After a new round: its number, and how many takes it dropped.
- After a park: which take, and where to find it.
- After a move: the take, its new track and letter, and how many votes came with it.
- After a cleanup: how many files you deleted, and how many takes are stored now.

## Stop and ask when

- Before any move with `"replace": true`. Say which votes it deletes.
- Before you delete any audio.
- A move answers 400, 404, 409 or 500 and the fix isn't in step 8.
- The owner's words could mean more than one take.
- The owner asks which prompt or model made a take while they're still judging. Say that knowing breaks the blind test, and answer only if they still want to know.
