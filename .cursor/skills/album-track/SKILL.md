---
name: album-track
description: Use when a new track title arrives, or a track's Suno prompts need a rewrite. It frames the track's job on the album, runs a five-way prompt arena, and ships the track sheet and its album.json entry.
---

# Album track

The title carries any joke. The Style field is a real brief for an excellent producer. The album's genre and its one rule are in `album/BRIEF.md`, and every prompt answers to them.

This skill ends with a published sheet and no audio. `suno-run` makes the takes.

## When to use

- The user gives a new track title, or picks a title from `album/album.json` that has no sheet yet.
- A track's prompts need a rewrite, for a redo with new takes.

Not for running Suno (`suno-run`) or for moving takes between tracks (`judge`).

## You need

- `~/album`, set up by `start-here`, with `album/album.json` and `album/BRIEF.md`.
- The title, exactly as it goes in Suno's Title field.
- The pstack plugin, for its arena skill. Without it, step 4 says how to run the arena yourself.

## Steps

1. **Frame the album job.** Read `album/BRIEF.md` and the sheets in `album/tracks/`.
   - Name the job this track does that the album doesn't do yet.
   - List the neighbors that already own nearby ground, by key, BPM and genre lane. The brief's Neighbors section and each sheet's p1 paragraph tell you.
   - A track that duplicates a neighbor is the failure mode, not a weak brief.
   - Ask the user for the mood only if they haven't said it. The genre lane is usually open inside the album's genre. Album coherence isn't.
   - A new song is always a Blank Create. A Cover is only for changing one thing in an existing take, and its sheet names that take's file.

2. **Place the track.**
   - If the title is already in `album/album.json`, use its number and slug.
   - Otherwise the number is the highest number in `album/album.json` plus one. Numbers are never reused, so a dropped track gets `"parked": true` and stays in the file. Get the slug:

     ```bash
     node --no-warnings -e 'import("./src/lib/album/slug.ts").then(m => console.log(m.slugifyTrackTitle(process.argv[1])))' "<Title>"
     ```

   - The set is the first set in `album/album.json` unless the user asks for a new one. A new set gets the next id (`v2`, `v3` and so on) and a nonsense name, like `Bubu`.
   - Letters: a new track starts at A. A redo continues after the last letter in the sheet's Canonical files table. Never reuse a letter.

3. **Write the frame.** Put `/tmp/arena-<slug>/FRAME.md` in place before anything else runs. It holds:
   1. The track number, the title, and whether it's a Blank Create or a Cover of a named file.
   2. The album job in one paragraph, in the user's own words where they gave them.
   3. The neighbor list, by key, BPM and genre lane, with the ground each one already owns.
   4. The output contract below.
   5. The hard constraints below.
   6. The grounding to read: the frame itself, `album/BRIEF.md` and the neighbor sheets in `album/tracks/`.

   **Output contract.** Each writer writes two files into its own `/tmp/arena-<slug>/candidate-<n>/` and nowhere else.
   - `PROMPTS.md`: a `# <Title> — <writer> suite` heading, then five `## p<n> — <lane name>` headings, each followed by one Style paragraph.
   - `RATIONALE.md`, 15 to 25 lines. It names the album job chosen. For each of the five prompts it gives the genre lane and one alternative it rejected. It says where it refused the title joke, and whether it ignored any constraint. The rationale is mandatory: without it there's no way to tell whether a suite's shape is principled or an accident, and grafting becomes guesswork.

   **Hard constraints.**
   - Four to six sentences per brief.
   - Front-load the genre, then the two sounds that define the record, then BPM and groove, then the arrangement through intro, tension, release, breakdown and last third, then one grown-up visual, then at most two touchstones.
   - Under 900 characters per paragraph, because Suno silently cuts near 1,000. Count. If it's over, cut from the end.
   - Never write `instrumental`, `no vocals`, `no singing`, `vocal-free` or `voiceless`. The Instrumental toggle, `vocals` in Exclude and `[Instrumental]` in Lyrics already handle it.
   - Never write `choir`, `gospel`, `choral`, `cantor`, `prayer` or `congregation`. Those words make Suno add a choir.
   - Keep the title, and any caption version of the joke, out of Style. A metaphor is allowed only when it's load-bearing as sound, like a filter opening being the sunrise.
   - No "no X" lists in the Style text. Say what it is.
   - The visual is a real place at a real time: a wet street in morning light, a kitchen after midnight. Not cartoons, not mascots.
   - Touchstones are rooms, eras and production attitudes, at most two. Prefer those to living artists' names. If the brief is near a famous record, don't name it. The feeling, not the citation.
   - Prompts only. Don't generate audio.

4. **Run the arena.** Five suites, best of five.
   - **With pstack:** run its arena skill (`/arena`) with this frame. Take the five writers from the `arena runners` line in `~/.cursor/rules/pstack-models.mdc`. If that line has fewer than five, add writers from other model families until there are five. Take one cross-judge from the `arena cross-judge pool` line, from a different model family than you. If a writer produces nothing, go on with four and note it.
   - **Without pstack:** write the five suites yourself, one at a time, each in its own `candidate-<n>/` folder. Give each suite a different direction for the whole set, and don't reread the earlier suites while you write.

   **Rubric.** Only you and the judge see it, never the writers. Score each suite 1 to 5 on each line, for a maximum of 25:
   1. **Album cohesion.** Still this album, by its genre and rule in `album/BRIEF.md`. Not a second album, not a jingle.
   2. **The job.** Does what the frame asked, and isn't a neighbor in a different key. Adapt this line to the track's job, and keep the other four as they are.
   3. **Suno craft.** Genre then two sounds, an arrangement map, under 900, no vocal negations, the joke out of Style.
   4. **Distinct lanes.** Five paid runs, not five coats of the same paint. Check the spread of BPM and key.
   5. **Visual.** A grown-up, real visual that fits the album. Not cartoons.

   Read every suite end to end. Pick a base suite, then graft the best one or two ideas from the others into it by hand, so the result still reads as one set.

5. **Write the sheet** at `album/tracks/<NN>-<slug>.md`, with `<NN>` as two digits. Use this shape exactly, because the site's `/studio` page reads it:

   ```markdown
   # <Title>

   Track <NN>. Set <set id> (<set name>). Blank Create.

   - Title field: `<Title>`
   - Instrumental: ON
   - Model: v5.5
   - Lyrics: `[Instrumental]`
   - Exclude: `vocals, <more>`

   ## Canonical files

   | Take | File                          | Prompt |
   | ---- | ----------------------------- | ------ |
   | A    | `v1-<NN>-<slug>-p1-takea.mp3` | p1     |
   | B    | `v1-<NN>-<slug>-p1-takeb.mp3` | p1     |

   ## p1 — <lane name>

   <one Style paragraph, under 900 characters>

   ## p2 — <lane name>

   <paragraph>
   ```

   - For a Cover, the line under the title ends `Cover of` and the source file's name in backticks, instead of `Blank Create`.
   - Two takes per prompt: A and B for p1, C and D for p2, and so on to I and J for p5. A redo starts after the last letter in use.
   - Filenames follow `<set id>-<NN>-<slug>-p<n>-take<letter>.mp3`, with the letter lowercase.
   - Add the choir words to Exclude when a brief goes anywhere near sustained major chords.
   - The first paragraph under each prompt heading is its Style paragraph, on one line. Put any note after it.
   - Lane names describe the sound. Keep model names out of the sheet, because the site shows it. They belong in the synthesis note.

6. **Verify the sheet mechanically.** Don't eyeball it. Pass the sheet, the filename prefix and the track's own banned words: the title, and whatever noun the pun is built on, separated by `|`.

   ```bash
   node -e '
   const [file, prefix, extra] = process.argv.slice(1);
   const md = require("fs").readFileSync(file, "utf8");
   const words = ["instrumental", "no vocals", "no singing", "vocal-free", "voiceless", "choir", "gospel", "choral", "cantor", "prayer", "congregation", extra];
   const banned = new RegExp(words.filter(Boolean).join("|"), "i");
   for (const [, lane, style] of md.matchAll(/^## (p\d+)[^\n]*\n\n([^\n]+)/gm)) {
     console.log(lane, style.length, style.length >= 900 ? "TOO LONG" : banned.test(style) ? "BANNED WORD" : "ok");
   }
   const rule = /^(v\d+-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)-p(\d{1,2})-take([a-z]{1,2})\.mp3$/;
   for (const [, take, name, prompt] of md.matchAll(/^\|\s*([A-Z]{1,2})\s*\|\s*`([^`]+)`\s*\|\s*(p\d+)\s*\|/gm)) {
     const m = rule.exec(name);
     const ok = m !== null && m[1] === prefix && m[3].toUpperCase() === take && `p${m[2]}` === prompt;
     console.log(take, name, ok ? "ok" : "BAD NAME");
   }
   ' album/tracks/<NN>-<slug>.md v1-<NN>-<slug> '<title words>|<pun noun>'
   ```

   Every line must end in `ok`. Fix what doesn't and run it again.

7. **Write the synthesis note** at `album/tracks/<NN>-<slug>-SYNTHESIS.md`, with these sections:
   - `## Problem`: the album job, and what the neighbors already cover.
   - `## Arena`: who wrote, who judged, and a score table with your score and the judge's for each suite.
   - `## Grafts`: a table naming the source suite and prompt for each final prompt.
   - `## Rejected`: every lane or idea you cut, and why. This is the most useful part, because it stops the next arena from retrying a lane that was already cut.
   - `## Verification`: what step 6 printed, in a sentence or two.

8. **Update the album files.**
   - In `album/album.json`, add `{ "number": <n>, "title": "<Title>", "slug": "<slug>" }` to `tracks` if it isn't there, and keep `tracks` in number order.
   - In `album/BRIEF.md` under `## Neighbors`, add one line: the number, the title, the key, BPM and genre lane of p1, and the job. Replace "None yet." if it's still there.

9. **Publish.** Follow the `publish` skill with the message `track <NN> <title>`. The title goes live before any audio exists, which is correct: the track shows on `/vote` with no takes yet.

## Check before you say done

- Step 6 printed `ok` on every line, with five prompts (or as many as the redo planned) and two files per prompt.
- The synthesis note has all five sections, and the sheet has no model names.
- The `publish` skill's checks passed.
- The packet shows on the site. Sign in with the key and fetch the track's `/studio` page:

  ```bash
  SITE=$(node -p 'require("./.album-site.json").siteUrl')
  node -e 'process.stdout.write(JSON.stringify({ key: require("fs").readFileSync(".album-key", "utf8").trim() }))' | curl -sS -c /tmp/album-owner-cookie -H 'Content-Type: application/json' --data-binary @- -o /dev/null -w '%{http_code}\n' "$SITE/api/owner/session"
  curl -sS -b /tmp/album-owner-cookie -o /dev/null -w '%{http_code}\n' "$SITE/studio/<slug>"
  ```

  You want `204`, then `200`. With `"deploy": "git"`, the build takes a minute or two, so retry the second command until it prints `200`.

## Tell the user

- The track's job on the album in one line, and the five lanes by name.
- The packet's link, `<siteUrl>/studio/<slug>`.
- What's next: `suno-run` makes the takes, one run per prompt and two takes per run.

## Stop and ask when

- The title is already a track, or it's ambiguous which track the user means.
- You can't find a job for the track that a neighbor doesn't already own.
- A brief can't get under 900 characters without losing its two defining sounds.
- The user wants vocals or lyrics. Every sheet runs with Instrumental on.
- A writer or the judge can't run, and fewer than three suites came back.
