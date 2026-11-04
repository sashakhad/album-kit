---
name: start-here
description: Use for the first run of a new album, when someone says let's make an album or there's no ~/album folder yet. It copies the kit, sets up the album site, gets the user signed in to Suno and writes the album brief.
---

# Start here

The first run for a new album. At the end the user has a live album site, a key to vote with, Suno connected to their own account and an album brief.

## When to use

- The user says "let's make an album" and `~/album` doesn't exist yet.
- The user names an album repo they already have, for example one the Deploy button made, and it isn't set up on this computer yet.

One folder and one site hold one album. For a second album, ask the user before you touch `~/album`.

## You need

- A terminal with `git`, and a browser the user can take over.
- The user, for the sign-ins: Vercel (free, and email sign-up works), Suno (a paid Premium plan), and Cursor on the Origin path only.
- For path (b): the link to the user's GitHub repo and the name of its Vercel project.

## Steps

1. **Get the kit.** If `~/album` already holds the kit, with `kit` as its remote, this step is done. If the user already named an album repo, skip to step 2 (b). If they named an album folder on this computer, work in that folder wherever this skill says `~/album`, and skip the clone. Otherwise:

   ```bash
   git clone https://github.com/sashakhad/album-kit ~/album
   git -C ~/album remote rename origin kit
   ```

   The rename keeps `pnpm publish:album` from ever pushing to the public kit. Later, `git -C ~/album pull --no-ff kit main` picks up kit updates. Run every command after this one from `~/album`.

2. **Pick the path.** Ask only if it isn't clear. The default is (a).
   - **(a) Bot only.** Nothing more to do here. The site deploys from this folder with the Vercel CLI.
   - **(b) The user already used the Deploy button.** Ask for their repo link and their Vercel project's name. The Deploy button suggests `my-album`. If `~/album` holds the kit, that copy has nothing in it yet, so replace it:

     ```bash
     rm -rf ~/album
     git clone <their repo URL> ~/album
     ```

     Their repo deploys on every push, so step 8 sets `deploy` to `git`.

   - **(c) Cursor Origin.** The album gets a private Origin repo in step 9 and keeps deploying with the Vercel CLI.

3. **Ask for the album title.** It also names the site. The rest of the interview waits until step 11.

4. **Install Node 24 if it's missing.** Run `node --version`. If it prints nothing, or a version below v24:

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   . "$HOME/.nvm/nvm.sh"
   nvm install 24
   ```

   Then turn on pnpm, which ships with Node: `corepack enable`. Say yes if Corepack asks to download pnpm. In a new shell, run `. "$HOME/.nvm/nvm.sh"` first if `node` isn't found.

5. **Sign in to Vercel.** Run `npx vercel login` and say yes if npx asks to install it. It prints a sign-in link. Open the link in your browser and ask the user to take over and sign in, or sign up free with email. Wait until the command says the login worked.

6. **Make the user the commit author.** Vercel's free plan blocks a deploy when the newest commit isn't by the account owner. Read the user's name and email:

   ```bash
   npx --yes vercel api /v2/user --raw | node -p 'const { user } = JSON.parse(require("fs").readFileSync(0, "utf8")); `${user.name ?? user.username}\n${user.email}`'
   ```

   Set them for this folder only. On path (b), use the email on the user's GitHub account if it's different, because their repo's pushes are checked against GitHub.

   ```bash
   git config user.name "<name>"
   git config user.email "<email>"
   ```

   Put the title in the `title` field of `album/album.json` and commit it, so the newest commit is the user's before the first deploy:

   ```bash
   git add album/album.json
   git commit -m "album: name the album"
   ```

7. **Set up the site.** Get the site name from the title:

   ```bash
   node --no-warnings -e 'import("./src/lib/album/slug.ts").then(m => console.log(m.slugifyTrackTitle(process.argv[1])))' "<title>"
   ```

   Inside the double quotes, put a backslash before any `"`, `$` or backtick in the title. If it prints nothing, use `my-album`. On path (b), use their Vercel project's name instead.

   If `.vercel/project.json` doesn't exist yet, check that the name isn't one of the user's other projects: `npx vercel project inspect <name>`. If that finds a project and it isn't this album, ask the user for another name. Then:

   ```bash
   pnpm install
   pnpm setup:site --name <name>
   ```

   Setup is safe to run again, because each run skips what's already done. Its exit code tells you what happened:
   - **0:** done. The last line is JSON with `siteUrl`, `albumKey` and `project`.
   - **2:** not signed in to Vercel. Do step 5 again, then rerun `pnpm setup:site --name <name>`.
   - **3:** the Neon database step needs the browser. The output says what to open. Open it, ask the user to take over and finish it, then rerun `pnpm setup:site --name <name>`.
   - **4:** setup couldn't read the Vercel account's email, so it can't make the user the commit author. Do what its message says. Usually that means asking the user for the email on their Vercel account, setting it as in step 6, then rerunning `pnpm setup:site --name <name>`.
   - **1:** stop. The output names the command that failed and its error.

8. **Save the site URL and the key.** `.album-site.json` holds `siteUrl`, and `.album-key` holds the key.
   - On path (b), if `.album-key` is missing, ask the user for the passcode they picked on the Deploy page and save it with `printf '%s\n' '<passcode>' > .album-key`. Then set `"deploy": "git"` in `.album-site.json`.
   - Give the user the site URL and the key. The key is how they vote: they open `<siteUrl>/key` once in each browser they use and paste it there. You never type the key into a web page.

9. **Path (c) only: give the album its Origin home.** The user takes over the browser for the sign-in.

   ```bash
   origin auth login
   origin auth setup-git
   origin repo create <name> --visibility private
   ```

   `origin repo create` prints the repo's full name, `<namespace>/<name>`. Add it as `origin` and push:

   ```bash
   git remote add origin "$(origin repo view <namespace>/<name> --json cloneUrl | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).cloneUrl')"
   git push -u origin main
   ```

   Keep `"deploy": "cli"` in `.album-site.json`. Origin repos only deploy on push with Vercel Pro, and the CLI works on the free plan.

10. **Connect Suno.** Add a custom MCP server named `Suno` with the URL `https://api.suno.com/mcp`, the way your app adds MCP servers. In Cursor, that's an entry in `~/.cursor/mcp.json`:

    ```json
    { "mcpServers": { "Suno": { "url": "https://api.suno.com/mcp" } } }
    ```

    Connecting opens Suno's sign-in. Ask the user to take over the browser, sign in with their own Suno account and approve the access it asks for, which includes downloading songs and spending credits. Runs spend their own plan's credits, and the songs land in their Suno library. Use only Suno's own server, never a third-party Suno API.

    If you can't add MCP servers, open https://suno.com in your browser instead, ask the user to take over and sign in, and leave that tab open for `suno-run`. Either way, if Suno asks for a plan or a payment, stop: the kit needs Suno Premium, and the user buys it themselves.

11. **Interview the user.** One question at a time:
    - the artist name
    - the genre, in one line
    - the album's one rule, for example "Funny titles, serious records."
    - three to five first track titles, exactly as they should appear in Suno's Title field

    Then fill in `album/album.json`. Keep the starter set (`v1`, named `Bubu`). Number the tracks from 1 in the order the user gave them, and get each slug with the command in step 7:

    ```json
    {
      "title": "<title>",
      "artist": "<artist>",
      "genre": "<genre>",
      "rule": "<the one rule>",
      "sets": [{ "id": "v1", "name": "Bubu" }],
      "tracks": [{ "number": 1, "title": "<first title>", "slug": "<slug>" }]
    }
    ```

    Write `album/BRIEF.md`. Start it with `# <title>`, then these sections, in the user's own words wherever they gave them:
    - `## What this album is`: one paragraph on the genre and the feeling.
    - `## The rule`: the one rule, and what it means for the Style prompts.
    - `## Sound`: what every track shares, such as the mix, the room, the era and the core kit.
    - `## Never`: banned words and moves. Start with the Style rules: no vocal negations (`instrumental`, `no vocals`, `no singing`, `vocal-free`, `voiceless`) and no choir words (`choir`, `gospel`, `choral`, `cantor`, `prayer`, `congregation`). Add whatever the user rules out.
    - `## Neighbors`: write "None yet." `album-track` adds a line for each track it writes.

    Show the user the brief and fix anything they correct.

12. **Publish.** Follow the `publish` skill with the message `start album`. It checks `album/album.json`, then runs `pnpm publish:album "start album"`, which prints the site URL.

## Check before you say done

- `git -C ~/album remote -v` shows `kit` at the public kit on paths (a) and (c), no `origin` on path (a), the user's repo as `origin` on path (b) and the Origin repo as `origin` on path (c).
- `git -C ~/album log -1 --format='%an <%ae>'` shows the user.
- `.album-site.json` has a `siteUrl` that starts with `https://`, a `project`, and `deploy` set to `git` on path (b) or `cli` otherwise.
- `.album-key` exists and holds one line.
- Suno is connected: you can list the Suno MCP server's tools, or, on the browser fallback, the Suno tab shows the user signed in.
- `curl -sS -o /dev/null -w '%{http_code}\n' "$(node -p 'require("./.album-site.json").siteUrl')"` prints `200`, and the home page shows the album title when you open it.

## Tell the user

- The site URL and the album key, and that they vote by pasting the key at `<siteUrl>/key` once in each browser.
- Where the album lives: only on your computer (a), in their GitHub repo (b), or in their private Origin repo (c).
- What's next: pick a first track, and you'll write its prompts with `album-track`.

## Stop and ask when

- `pnpm setup:site` exits 1, or exits 3 or 4 again after the user did what it asked.
- A page asks for anything beyond signing in or signing up: a payment, a plan, or another account.
- A captcha shows up. The user takes over the browser; never solve it yourself.
- The user's repo doesn't look like the kit, because it has no `.cursor/skills/` or `album/album.json`.
- The `origin` command isn't installed (path c).
- The site name is already taken by a project that isn't this album.
- A push to the user's repo asks for credentials (path b).
