---
name: publish
description: Use after any change under album/, or when the user wants the album backed up to GitHub or Cursor Origin. It commits the album, redeploys the site and gives the site URL.
---

# Publish

Every album change goes live the same way. Publishing is part of each change, so you don't need to ask first.

## When to use

- After any change under `album/`: a new track, a sheet, a title, a pin, the brief or the generation log.
- When the user wants the album backed up, or given a GitHub or Origin home.
- When you pick up kit updates.

## You need

- `~/album`, set up by `start-here`, with `.album-site.json`.
- For a GitHub home: access to the user's GitHub account, through the GitHub plugin or a signed-in `gh` command.
- For an Origin home: the `origin` command, or the user's help to create the repo at cursor.com/codebase, which also shows how to install it.

## Steps

1. Go to the album with `cd ~/album`.

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

3. Publish, with a short message that says what changed:

   ```bash
   pnpm publish:album "<message>"
   ```

   It commits `album/` and `.album-site.json` as `album: <message>`, pushes if the album has a git home, deploys and prints the site URL. With `"deploy": "git"` in `.album-site.json`, Vercel builds from the push, so the change shows a minute or two later. With `"deploy": "cli"`, it first checks that you're signed in to Vercel, and if the newest commit isn't by that account, it switches the folder's git user to the account and adds an empty commit, `album: deploy as <username>`.

   If it exits with code 4, it couldn't read the signed-in Vercel account. Run `npx vercel login`, ask the user to take over the browser and sign in, then publish again.

4. Check that the site answers:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' "$(node -p 'require("./.album-site.json").siteUrl')"
   ```

   You want `200`. A `500` usually means `album/album.json` broke a rule the check in step 2 doesn't cover.

### Give the album a home later

A bot-only album lives only on your computer. Back it up when the user asks. Use `project` from `.album-site.json` as the repo name.

**GitHub.** Make a private repo in the user's account and push the album to it:

```bash
gh repo create <project> --private --source . --remote origin --push
```

With the GitHub plugin instead, create the private repo there, then run `git remote add origin <repo URL>` and `git push -u origin main`. Keep `"deploy": "cli"`: the site still deploys with the Vercel CLI, and every publish now pushes too.

**Cursor Origin.** Check whether the Origin command is on this computer with `command -v origin`.

- **If it prints a path,** run these. `origin auth login` opens a sign-in, so ask the user to take over the browser for it:

  ```bash
  origin auth login
  origin auth setup-git
  origin repo create <project> --visibility private
  ```

  `origin repo create` prints the repo's full name, `<namespace>/<project>`. Then:

  ```bash
  git remote add origin "$(origin repo view <namespace>/<project> --json cloneUrl | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).cloneUrl')"
  git push -u origin main
  ```

- **If it prints nothing,** open https://cursor.com/codebase in your browser and ask the user to take over, sign in, click **+New** and create a private repo named `<project>`. The page then shows the command that installs `origin` and the commands that push to the new repo. Run them exactly as the page shows them, from `~/album`. When `origin auth login` runs, ask the user to take over the browser for the sign-in.

Keep `"deploy": "cli"`. Origin repos only deploy on push with Vercel Pro. If the install or the sign-in fails, tell the user, remove any `origin` remote you added with `git remote remove origin`, and leave the album as it was.

### Pick up kit updates

On albums that started from the kit (paths (a) and (c) in `start-here`), run `git pull --no-ff kit main`, then publish with the message `kit update`. `--no-ff` makes the newest commit a merge by the user, which Vercel's free plan needs before it deploys. Albums made with the Deploy button don't share the kit's history, so this doesn't apply to them.

## Check before you say done

- `pnpm publish:album` printed the site URL.
- `git status --short album .album-site.json` prints nothing.
- The check in step 4 prints `200`, and the change shows on the site.
- For a new home: `git remote -v` shows `origin` at the new private repo, and the push went through.

## Tell the user

- What changed, and the site URL.
- For a new home: the repo link, and that it's private.

## Stop and ask when

- The album.json check prints a problem you can't fix from what the user told you.
- `pnpm publish:album` fails with code 1, or with code 4 again after the user signed in. Show the user its last lines. Never force-push.
- A push is rejected because the remote has commits this folder doesn't have.
- The site answers `500` after a publish.
- Making the repo would make it public, or needs a paid plan.
