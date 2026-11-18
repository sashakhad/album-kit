---
name: publish
description: Redeploy a creator’s hosted voting app directly to Vercel, update an album from a fresh kit copy, or back it up when requested.
---

# Publish · version 8

Sasha never hosts Album Bot for anyone. A new album begins with the local player. After the creator chooses **Share album** or explicitly requests `/share`, follow **Share** in `start-here`. `pnpm share:album` reads the saved path. Lite publishes a static HTML player. Full Setup deploys the entire Next.js album app to the creator’s own Vercel project. Pass `--ref <verified-kit-SHA>` to share the verified `sashakhad/album-kit` scaffold at the selected revision with the creator's existing songs, track sheets, generated takes and settings. Reuse the album’s project and data on retries and updates. This skill also handles an explicitly requested GitHub or Origin backup.

The hosted site is public. Review takes are made public on Suno automatically and silently and play from stored public MP4 stream URLs. Never ask how review takes should play. Do not download a review take. Only a final pick is downloaded, and that download is silent.

## When to use

- After an album change on an existing advanced hosted site, such as a new track, sheet, title, pin, brief or generation log.
- When the user wants the album backed up, or given a GitHub or Origin home.
- When you pick up kit updates.

## You need

- The creator's album folder, its `.album-site.json`, and access to the Vercel project that holds the app. No GitHub account or repository is needed to deploy.
- For a GitHub home: access to the user's GitHub account, through the GitHub plugin or a signed-in `gh` command.
- For an Origin home: the `origin` command, or the user's help to create the repo at cursor.com/codebase, which also shows how to install it.

## Steps

1. Work in the creator’s album folder. Check the title and the linked Vercel account and project before publishing.

2. Check `album/album.json`. Fix anything this prints before you go on:

   ```bash
   node -e '
   const album = require("./album/album.json");
   const errors = [];
   const setIds = new Set();
   for (const set of album.sets) {
     if (!/^v\d+$/.test(set.id) || setIds.has(set.id)) errors.push(`set ${set.id}: ids are v1, v2 and so on, each used once`);
     if (typeof set.name !== "string") errors.push(`set ${set.id}: name must be text`);
     setIds.add(set.id);
   }
   if (typeof album.title !== "string" || album.title.length === 0) errors.push("title is empty");
   for (const field of ["artist", "genre", "rule"]) {
     if (typeof album[field] !== "string") errors.push(`${field} must be text, even if empty`);
   }
   if (setIds.size === 0) errors.push("sets needs at least one set");
   const numbers = new Set();
   const slugs = new Set();
   for (const track of album.tracks) {
     const n = track.number;
     if (!Number.isInteger(n) || n < 1 || n > 99 || numbers.has(n)) errors.push(`track ${n}: number must be 1 to 99 and unique`);
     if (!track.title) errors.push(`track ${n}: title is empty`);
     if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(track.slug) || slugs.has(track.slug)) errors.push(`track ${n}: slug ${track.slug} is malformed or used twice`);
     for (const pin of [track.listen, track.vip]) {
       if (pin && (!setIds.has(pin.set) || !/^[A-Z]{1,2}$/.test(pin.take))) errors.push(`track ${n}: pins need a set from sets and an uppercase take letter`);
     }
     numbers.add(n);
     slugs.add(track.slug);
   }
   console.log(errors.length > 0 ? errors.join("\n") : "album.json ok");
   process.exitCode = errors.length > 0 ? 1 : 0;
   '
   ```

3. Tell the owner you are publishing, then publish, with a short message that says what changed:

   ```bash
   pnpm publish:album "<message>"
   ```

   The command deploys this folder directly to the creator’s linked Vercel project and prints its production URL. It also works for albums that previously deployed from Git. Keep the existing project and credentials on retry.

4. Check that the site answers:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' "$(node -p 'require("./.album-site.json").siteUrl')"
   ```

   Open the deployed voting app at `<site>/vote` in a signed-out browser. Confirm Compare takes opens directly, the listed takes play, and the listener scoring controls are available. Send this ordinary public link for judging. `<site>/listen` plays the chosen lineup. Verify that playback advances, seeking and next-track work, and mobile controls fit. Keep credentials for owner actions private.

### Optional repository backup

Only set up GitHub or Cursor Origin if the creator asks to save the album there. Confirm the destination account and repository visibility, and review which album files the backup will include. Keep local credentials, `.env`, Vercel project credentials and private ballots out of the backup.

**GitHub.** For a public backup explicitly requested in the creator's GitHub account, run `pnpm album:github`. For a private backup, use the signed-in GitHub connector to create a private repository and push only the approved files. Verify the destination belongs to the creator, especially if the album folder started as a copy of the upstream kit. The Vercel hosting project stays independent of this backup.

**Cursor Origin.** If the creator specifically requests an Origin backup, use the signed-in `origin` CLI or their account at cursor.com/codebase. Create or select the private backup repository there. In the album folder, verify the repository URL and the files included in the backup commit. Push that commit to the verified URL. Keep the existing Vercel project and deployment settings.

### Pick up kit updates

From a fresh kit copy, run `pnpm kit:update <existing-album-directory>` or `node scripts/update-album-kit.mjs <existing-album-directory>`. It updates the kit code in that album folder while preserving its `album/` directory, ballots, environment, deployment link and custom files. Publish a requested voting app update from that album folder with `pnpm publish:album "Kit update"`. For a static page, repeat **Share** from `start-here` with the same project and scope.

## Check before you say done

- For a hosted voting app, the public production `/vote` page shows this album’s generated takes and plays audio for a signed-out listener. Verify scoring and share that public URL.
- For a backup, verify the files appeared in the requested account and confirm its actual visibility.
- If publishing fails, give the creator the specific blocker, keep the local player available and retry the same Vercel project after the blocker is resolved.
