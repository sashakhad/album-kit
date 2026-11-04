---
name: suno-run
description: Use when a track sheet is ready for Suno, or the user wants more takes of a track. It runs the sheet's prompts in Suno, downloads the takes, names them and uploads them to the album site.
---

# Suno run

You drive Suno so the owner doesn't have to. You paste, click, download and file. You never judge the music: the owner does that on `/vote`.

## When to use

- A track's sheet is published and its takes don't exist yet.
- The user wants more takes of a track. `album-track` writes the new prompts and letters first.

## You need

- The track's sheet, `album/tracks/<NN>-<slug>.md`, published.
- The Suno tab from `start-here`, signed in. The user takes over the browser for sign-ins and captchas.
- `~/album` with `.env.local`, `.album-key` and `.album-site.json` from setup.

## Steps

1. **Read the sheet.** Note the Title field, the Model, the Exclude value, whether it's a Blank Create or a Cover, and the Canonical files table. The table is the plan: one run per prompt, and each run makes two takes. Count the runs it plans before you start.

2. **Open Create.** Go to https://suno.com/create in the signed-in tab.

3. **Do one run per prompt, p1 first.** Start every run from a blank Create: clear every field, and never start from an earlier song's Remix, Cover or Extend. Then, in this order:
   1. Switch to **Advanced** mode, not Simple.
   2. Turn **Instrumental** on.
   3. Pick the sheet's **Model**.
   4. **Style:** paste the prompt's paragraph exactly as the sheet has it. Copy and paste, never retype. Don't add the title, the track number or any other words.
   5. **Exclude styles** (under More Options): paste the sheet's Exclude value.
   6. **Lyrics:** paste `[Instrumental]` if the Lyrics box shows.
   7. **Title:** paste the sheet's Title field.
   8. Click **Create** once. That's one run, and it makes two takes.

   As each run finishes, write down its prompt and its two new songs, in the order Suno lists them, in a scratch file outside the album, like `/tmp/suno-<slug>.txt`. Copy each song's link there. Song links and IDs never go in the album's files.

   If a field has a different label, use the one that does the same job and note it in the log. If a field is missing, stop and ask.

4. **Cover sheets.** If the sheet says `Cover of` a file, every run is a Cover of that exact file. Upload it to Suno and run Cover on it, filling the fields as in step 3. The file is in `album/audio/`. If it isn't there, fetch it from the site first:

   ```bash
   curl -fsSL -H "Authorization: Bearer $(cat .album-key)" -o album/audio/<file> "$(node -p 'require("./.album-site.json").siteUrl')/api/audio/<set>/<file>"
   ```

   Never Cover a different take.

5. **Captchas.** If Suno shows a captcha or a "verify you're human" check, stop. Ask the user to take over the browser, and wait until they hand it back. Never solve it yourself.

6. **Rerun rules.**
   - The sheet plans one run per prompt, so any rerun spends more than the sheet plans. Ask the user first, and name the prompt and the reason.
   - Rerun only for a take that broke a hard rule: it has singing, a choir or spoken words, it fades out instead of ending, or it stops early. Never rerun because a take sounds weak. The owner judges that.
   - If you can't tell whether a take broke a rule, keep it.
   - When a take grows a choir, add the choir words to Exclude for the rerun. When a prompt keeps fading out, add `fade-out` to its Exclude. Write any Exclude change into the sheet.
   - A rerun's takes reuse the letters of the takes they replace, if those never got uploaded. Takes already on the site keep their letters, and new ones continue after the last letter in the sheet. Add new rows to the sheet's Canonical files table.
   - Don't change titles, track numbers or prompts.

7. **Download the takes by address.** When the runs are done, get each new take's MP3 address from its song in Suno: the song's Download menu, or the audio source of the player on its page. Then download them by address in the same signed-in tab. Don't click through each song's download menu one at a time, and don't fetch the addresses from the terminal: without the browser's sign-in, Suno answers 403. One way is a short script in the Suno tab's console that saves each take under its canonical name:

   ```js
   const takes = [
     ['v1-07-plant-bassd-p1-takea.mp3', '<MP3 address>'],
     ['v1-07-plant-bassd-p1-takeb.mp3', '<MP3 address>'],
   ];
   for (const [name, address] of takes) {
     const response = await fetch(address);
     const link = document.createElement('a');
     link.href = URL.createObjectURL(await response.blob());
     link.download = name;
     link.click();
   }
   ```

   If the browser asks whether the page may download several files, allow it. The files land in the browser's download folder, usually `~/Downloads`.

8. **Count before you rename anything.** Count the downloads against the runs. If takes are missing, say which ones and ask. Don't search the rest of the disk.

9. **Name the files.** Move each take into `album/audio/` under its canonical name from the sheet. In each run, the take Suno listed first gets the run's first letter.

   ```bash
   mv ~/Downloads/<downloaded file>.mp3 album/audio/v1-07-plant-bassd-p1-takea.mp3
   ```

10. **Upload.**

    ```bash
    pnpm takes:upload album/audio/v1-07-plant-bassd-p1-takea.mp3 album/audio/v1-07-plant-bassd-p1-takeb.mp3
    ```

    List every new file. The script checks all the names first and uploads nothing if one is wrong. Fix the name to match the sheet, never the sheet to match the name. It replaces Suno's tags with the album's own, then prints `uploaded`, `skipped` or `failed` for each file and a summary. `skipped` means a file with that name is already on the site, so leave it. If a file failed for lack of space, follow "Free up storage" in the `judge` skill.

11. **Check the storage.** Count the takes stored:

    ```bash
    npx --yes vercel blob list --prefix takes/ --limit 1000 --json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).blobs.length'
    ```

    If it's more than 150, tell the user and follow "Free up storage" in the `judge` skill.

12. **Log the session.** Add one entry to the end of `album/GENERATION-LOG.md`, and create the file if it's missing:

    ```markdown
    ## <yyyy-MM-dd> · <NN> <Title>

    - Ran: p1 to p5, one run each, takes A to J.
    - Reruns: which prompts, how many times, and why. "None" if none.
    - Suno fought: what it kept doing wrong, per prompt.
    - Couldn't make work: any prompt that failed every time, or "None".
    ```

    No song links or IDs. A prompt that fails every time also goes in the `## Rejected` list of the track's `-SYNTHESIS.md`, so the next arena doesn't retry it.

13. **Publish.** Follow the `publish` skill with the message `track <NN> takes`. It commits the log and any sheet changes. Audio never goes in git, because `album/audio/` is ignored.

## Check before you say done

- `album/audio/` has every take this session planned, under its canonical name.
- `pnpm takes:upload` reported no `failed` files.
- Each new take plays for the owner. For each file:

  ```bash
  curl -sSL -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat .album-key)" "$(node -p 'require("./.album-site.json").siteUrl')/api/audio/<set>/<file>"
  ```

  You want `200`.

- `album/GENERATION-LOG.md` has today's entry, and `grep -n "suno.com" album/GENERATION-LOG.md` prints nothing.
- The `publish` skill's checks passed.

## Tell the user

- How many takes are up, and the link to vote on them: `<siteUrl>/vote/<slug>`.
- The runs used against the runs planned, and anything Suno fought, in a line.

## Stop and ask when

- A captcha, a sign-in or a payment page shows up.
- A rerun would go past the runs the sheet plans.
- Takes are missing after the download.
- A take is `skipped` but you think the file on the site is wrong. Ask before you run `pnpm takes:upload` with `--force`, and never use it on a take that has votes.
- Suno has no field this skill names, or doesn't offer the sheet's Model.
