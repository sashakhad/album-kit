# Album kit

Make an album with Suno, hear every take, and choose the winners. The album lives in `album/`. Grok Bot can run the basic workflow. Cursor is optional for a project handoff or verified model comparison.

Sasha never hosts Album Bot for anyone. Make and play your album locally. If you choose to share it, the listening page runs on your own Vercel account.

## Guides

- [Product requirements](docs/prd.md)
- [Execution plan](docs/execution-plan.md)
- [Decision charts](docs/decision-charts.md)
- [Tester walkthrough](docs/tester-walkthrough.md)

ChatGPT and Claude can follow [grokbot/PORTABLE.md](grokbot/PORTABLE.md). Grok Bot with Cursor is the supported path. Credit a writer only when that model actually returned the prompt.

## Start

Open Album Bot and tell it your album idea. Choose Lite for a quick listen or Full Setup to compare prompt writers. Lite prefers v6-mini when your Suno account offers it. You can ask for another model. Both paths send **Open Album.html** as soon as the first take plays. When other tracks are still on the list, the line with that file is “Here’s your first take. I’ll make the next tracks on the album. /more makes more takes of this song, and /pick chooses favorites.” Listen while the rest finish.

In an existing Album Bot chat, type `/refresh` to load the latest instructions and keep working on the same album. To test an unmerged change, use `/refresh <branch-or-SHA>` and then `/refresh main` to return to the release. If an older chat doesn’t recognize the command, tell it to reread [the playbook on main](https://raw.githubusercontent.com/sashakhad/album-kit/main/grokbot/BOT.md) and continue the current album. Use `/listen` for existing takes, `/start` for a fresh album, or `/surprise` to let the bot pick. When configuring your own bot, use the [custom instructions](grokbot/INSTRUCTIONS.md).

You will need your own Grok Bot on an [X Subscription Premium](https://x.ai/pricing) plan ($30+). Suno can be [Free](https://suno.com/pricing) ($0, 50 Suno credits a day, v6-mini only, non-commercial) or [Suno Pro](https://suno.com/pricing) ($10) or [Suno Premier](https://suno.com/pricing) ($30). You pay for your own Suno. The bot never buys a plan. Review takes are made public on Suno automatically and silently and stream from the public MP4. Never ask how review takes should play. Only a final pick is downloaded, and that download is silent. [Cursor](https://cursor.com/pricing) is optional.

The bot still checks Suno generation credits, plus external prompt models when a hosted site is in play. It says those numbers only when cost matters. One approved round covers generation through streaming and voting. A settings limit or imported preset is never spending approval.

## Preview before sharing

Open **Open Album.html** from the chat. Tap a track and it plays, the same way Listen does in the album app.

When a take becomes playable, pass its canonical filename, clip ID and public stream URL as a JSON record to `node scripts/preview-album.mjs --record <ready-take.json>` (Node 24). Send the file named by `link` in the album chat. Each subsequent record produces an updated player with the previous takes included. To reopen an existing catalog, run `node scripts/preview-album.mjs --streams-only`. The file is the Listen player. For a ballot saved to the checkout, run `node scripts/preview-album.mjs --serve` and open its local URL. Refresh it with `node scripts/preview-album.mjs` and reload that URL. For offline playback with local audio files, use `node scripts/preview-album.mjs --zip`.

## When the album is ready

Once every requested take is playable, Album Bot asks **“Your album is ready. What’s next?”**

- **Share album** publishes to your Vercel account. Lite shares the standalone player. Full Setup builds the Album Kit app with your tracks, Listen, Compare takes, Settings and shared voting.
- **Add more tracks** makes new songs for this album. Tell the bot what you have in mind. The first new take appears alongside your existing tracks, with your scores and pass preserved.

You can also type your own reply or keep listening. Use `/share` later to share, or `/more` for another take of an existing track.

Full Setup and creators who want shared voting can use the hosted app described below.

## Skills

The playbook is `.cursor/skills/`. Read a skill's `SKILL.md` before its steps. The skills are `start-here`, `album-track`, `song-prompts`, `suno-run`, `judge`, `finish`, and `publish`.

## Advanced: hosted voting

Full Setup uses the Next.js app from the public `sashakhad/album-kit` scaffold at the selected kit revision. Your album supplies the tracks and recordings. Album Bot deploys that app to your Vercel project and checks listening and voting before sharing the link. A Neon database keeps the ballots, and Vercel Blob stores uploaded audio. No GitHub account, repository or access token is required.

If you're running the kit yourself, open your album folder with Node 24 and pnpm installed. Sign in to Vercel as the creator, then run:

```sh
pnpm install
pnpm setup:site --name <album-slug> --scope <your-vercel-scope>
```

Album Bot can handle the commands. It asks you for account access only when a provider requires it. The setup command creates or reuses the project, configures storage and the database, deploys the app, and saves its URL in `.album-site.json`. It generates the album's private management credential and stores it in the project environment and local `.env`. Open the printed production URL at `/vote` to listen and score. Each browser has its own ballot. Vercel Hobby eligibility depends on how the album will be used. [Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)

## Kit updates and optional backup

From a fresh copy of the kit, run `pnpm kit:update <existing-album-directory>` to update an album's app code. The same command works with Node alone as `node scripts/update-album-kit.mjs <existing-album-directory>`. The updater preserves the album's music, brief, track sheets and local state. To update a hosted voting app, run `pnpm publish:album "Kit update"` in that album directory and check its public `/vote` page. For a shared static player, run `pnpm share:album --project <album-project> --scope <your-vercel-scope>` with the project and scope already saved for that album.

If you also want a GitHub backup, tell Album Bot which account to use and whether the repository should be public or private. The optional `pnpm album:github` helper creates a public backup.

## Settings and rounds

Open **Settings** in the album’s header, edit a choice, and select **Save changes**. Sharing and listening changes take effect on the site when saved. Music settings apply to new rounds. Use **Sharing** to copy the public link.

Settings are saved in the album’s Postgres database (`AlbumSettings`). They survive reloads and deployments, and Grok Bot uses the same record. `album/album.json` defines the title, artist, and tracks; it does not hold site settings. The bot can read with `pnpm album:settings` and send a JSON object of just the changed fields on stdin to `pnpm album:settings --patch`. These commands use the owner-only `/api/owner/settings` endpoint. Defaults and album overrides are separate fields. Imported music presets are drafts on the site until saved and preserve your current sharing choice.

With Auto, Lite prefers v6-mini when the account offers it. Full Setup uses the account’s supported quality model. Explicit model choices take priority. [Suno currently recommends v6](https://help.suno.com/en/articles/13924737) for eligible accounts; that version is not pinned forever. Grok Bot prompt records say **model undisclosed**. A Cursor model label is verified only from its runtime output. The site has no Cursor execution adapter yet, so selecting Cursor requires a real Cursor handoff and a verified external estimate before a paid round can begin.

Visible listening shows the selected take's Style prompt from its track sheet in the collapsed Prompt section below the playback controls, plus saved provenance when available. This applies to owners and listeners. Reveal after voting waits until every available take has a vote in the round. Keep hidden omits those details from voting. Blind voting saves a randomized order, uses neutral labels and opaque audio URLs, and omits filenames and prompt details from the browser payload. Deliberately opening Studio records exposure, so later votes can be interpreted correctly. New uploads strip common MP3 metadata; migrate or scrub older takes before claiming a legacy round is blind.

The bot saves each round's settings, resolved model, capability snapshot, estimate and authorization. It records operation IDs before Suno calls, and provider IDs after acceptance. Retry a known job by polling it, not by making another paid generation. Per-take provenance is recorded through `/api/owner/provenance`; missing model information stays explicitly unverified. Review takes are made public on Suno automatically and silently. Never ask how review takes should play.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm exec prisma migrate deploy
pnpm dev
```

The local site does not need a password. With no Blob connection, put canonical MP3 files in `album/audio/`. New takes can play from a stored Suno stream URL without a file. Generate on Compare takes stores the request for Album Bot, which pulls it and makes the takes, on the official connector or on suno.com for a Free account. The site does not hold a Suno login. `pnpm owner:link` opens the owner’s browser for that button. Use `pnpm takes:upload <files...>` for hosted upload. It uses a Blob token if available, otherwise the site upload API and `ALBUM_WRITE_TOKEN` from `.env`.

Run `pnpm check` for formatting, lint, types and tests. Run `pnpm publish:album "message"` after a permitted album change. Verify the Vercel project, account and public URL before sharing.

## Boundaries

- A take is a full mix. Stems are separate files created by a split.
- No title joke or joke-derived musical premise goes in a Suno Style prompt.
- The owner judges takes; the bot does not choose winners.
- No live Suno credits or third-party model spend are used by repository tests.

### Listening and previews

Listen is the primary listening page. It plays an owner’s chosen take or each take tied for the highest positive owner score. Everyone can hear a Preview when a track has no choice or positive score. Scoring happens on Compare takes, from each take chip or the player’s Score panel. Compare takes opens the scoring screen; each neutral take label keeps a score visible, including zero. Prompts start collapsed below the player and follow the saved visibility/reveal policy. Source-set names are retained internally, not used as listening labels.
