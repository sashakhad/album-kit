# Album kit

Make an album with Suno, hear every take, and choose the winners. The album lives in `album/`. Grok Bot can run the basic workflow. Cursor is optional for a project handoff or verified model comparison.

Sasha never hosts Album Bot for anyone. No shared Album Bot site, no shared database, and no user's album goes on Sasha's Vercel or Neon. Do not ask anyone about shared hosting. Each owner uses the local preview, or that owner's own accounts.

## Start

Open [Album Bot](grokbot/BOT.md) and type `/start`, or `/surprise` if you want the bot to pick the album. A small test is one or two tracks, with two prompts and one Suno generation per prompt on each (4 takes, about 20 Suno credits per track). The bot checks that balance silently and does not say the number unless the balance is tight, the plan is Suno Free and the daily cap limits the run, one step is over about 200 Suno credits, or it costs real money. With thousands of Suno credits it says what it is making and leaves the number out. `/cost` and `/settings` still show the numbers.

The bot writes the songs, makes the takes on Suno, and opens a local album player. You listen and vote there. No GitHub repo, Vercel project, or database is required.

You will need your own Grok Bot on an [X Subscription Premium](https://x.ai/pricing) plan ($30+). Suno can be [Free](https://suno.com/pricing) ($0, 50 Suno credits a day, v6-mini only, non-commercial) or [Suno Pro](https://suno.com/pricing) ($10) or [Suno Premier](https://suno.com/pricing) ($30). You pay for your own Suno. The bot never buys a plan. Review takes are made public on Suno automatically and silently and stream from the public MP4. Never ask how review takes should play. Only a final pick is downloaded, and that download is silent. [Cursor](https://cursor.com/pricing) is optional.

The bot still checks Suno generation credits, plus external prompt models when a hosted site is in play. It says those numbers only when cost matters. One approved round covers generation through streaming and voting. A settings limit or imported preset is never spending approval.

## Preview before sharing

Album Bot opens a local preview as soon as the first take is ready. In a checkout, `pnpm preview:album` refreshes `.tmp/album-preview/Open Album.html`. Double-click it to listen and vote. Votes stay in that browser. For a loopback ballot, run `pnpm preview:album --serve` and open the returned URL. Votes and the selected take are saved in `.tmp/album-preview-ballot.json`. Restart the preview server after adding takes. Existing local MP3s work offline. Public Suno streams are labeled and require internet. The exporter does not spend download credits and does not make a private take public. For a remote session, `pnpm preview:album --zip` packages the page and its local audio. Unzip the archive before opening `Open Album.html`.

## Share

`/share`, or a request to share, send it to friends, or put it online, publishes that same preview as a static site on **your** Vercel account. One tap connects the Grok Bot Vercel connector. The deploy is the preview page plus its audio. There is no database and no GitHub repo. Votes are not stored on that page. Hosted voting is the advanced path below, and only when you ask for it.

## Skills

The playbook is `.cursor/skills/`. Read a skill's `SKILL.md` before its steps. The skills are `start-here`, `album-track`, `song-prompts`, `suno-run`, `judge`, `finish`, and `publish`.

## Advanced: hosted voting

This path is only for an owner who explicitly wants friends to vote on a site. It uses a repository in **your** GitHub account, with this kit recorded as its upstream, plus your own Vercel project and your own Neon database. The bot can use a local or cloud checkout. If you set it up yourself, use Node 24, pnpm, a signed-in `gh` CLI, Vercel CLI and Docker for local Postgres:

```bash
git clone https://github.com/sashakhad/album-kit my-album
cd my-album
git remote rename origin kit
gh repo create my-album --private --source . --remote origin --push
pnpm install
pnpm setup:site --name my-album
```

`setup:site` creates or links your Vercel project, a public Blob store, a Neon database, and a write token. It generates `ALBUM_WRITE_TOKEN`, stores it on the Vercel project and in `.env`, and never prints it. `.album-site.json` holds the site URL. The home page plays the album. Listener voting stays off until you turn it on. Want it private? Change your Vercel/GitHub settings.

On this advanced path, Album Bot connects GitHub and Vercel with the Grok Bot connectors and a one-tap card, then runs `pnpm setup:site`. The CLI commands above are the fallback when a connector cannot do a step. Neon is created on the owner's own account, with the Neon connector or Vercel Marketplace Neon. [GitHub](https://github.com/pricing) and [Vercel](https://vercel.com/pricing) Hobby are free. Vercel Hobby is for eligible [personal, non-commercial use](https://vercel.com/docs/limits/fair-use-guidelines). The hosted site also uses Vercel Blob and Postgres through Neon. Want it private? Change your Vercel/GitHub settings. Listener voting on that site stays off until you turn it on.

An existing **public** Blob store cannot protect already uploaded objects by changing a site setting. Migrate takes into a private Blob store and retire the old public objects before selecting Private; Settings requires a verified private store and `PRIVATE_BLOB_AUDITED=true` after that audit. New setup sets this flag because it creates no earlier public take store. Private listening invites are one-use links that expire after 15 minutes. The link secret is in the URL fragment, removed on opening, and exchanged for a revocable viewer cookie. Viewers can hear final picks. With listener voting on, they can also hear previews and score takes, and those scores stay separate from the owner's. They cannot change Settings. Test access on a second browser before sharing.

## Kit updates

`albums.json` lists album repositories. A merge to this repo's `main` branch copies the kit into each one and pushes. It does not change `album/BRIEF.md`, `album/album.json`, or `album/tracks/`. The album's Vercel project is connected to that repository, so the push deploys production. `ALBUM_SYNC_TOKEN` in this repo's GitHub secrets must be able to push to those repositories. See `grokbot/BOT.md` for the registration steps.

`vercel.json` keeps production deploys of this kit's `main` branch off. Album repositories do not get that switch: `pnpm setup:site`, `pnpm album:github`, and album sync write their `vercel.json` so a push to `main` deploys production. Connect this GitHub repository in Vercel to get a preview deployment for each pull request.

## Settings and rounds

Open **Settings** in the album’s header, edit a choice, and select **Save changes**. Sharing and listening changes take effect on the site when saved. Music settings apply to new rounds. Use **Sharing** to copy the live listener link or invite someone to a private album.

Settings are saved in the album’s Postgres database (`AlbumSettings`). They survive reloads and deployments, and Grok Bot uses the same record. `album/album.json` defines the title, artist, and tracks; it does not hold site settings. The bot can read with `pnpm album:settings` and send a JSON object of just the changed fields on stdin to `pnpm album:settings --patch`. These commands use the owner-only `/api/owner/settings` endpoint. Defaults and album overrides are separate fields. Imported music presets are drafts on the site until saved and preserve your current sharing choice.

Auto resolves against the connected Suno account's supported quality model before each round. [Suno currently recommends v6](https://help.suno.com/en/articles/13924737) for eligible accounts; that version is not pinned forever. Grok Bot prompt records say **model undisclosed**. A Cursor model label is verified only from its runtime output. The site has no Cursor execution adapter yet, so selecting Cursor requires a real Cursor handoff and a verified external estimate before a paid round can begin.

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

Run `pnpm check` for formatting, lint, types and tests. Run `pnpm publish:album "message"` after a permitted album change. Verify the deployment branch, owner, environment and working URL before sharing.

## Boundaries

- A take is a full mix. Stems are separate files created by a split.
- No title joke or joke-derived musical premise goes in a Suno Style prompt.
- The owner judges takes; the bot does not choose winners.
- No live Suno credits or third-party model spend are used by repository tests.

### Listening and previews

Listen is the primary listening page. It plays an owner’s chosen take or each take tied for the highest positive owner score. Owners and people allowed to vote can hear a Preview when a track has no choice or positive score. Scoring happens on Compare takes, from each take chip or the player’s Score panel. With listener voting off, visitors can only play published picks. Private albums still require an invitation. Compare takes opens the scoring screen; each neutral take label keeps a score visible, including zero. Prompts start collapsed below the player and follow the saved visibility/reveal policy. Source-set names are retained internally, not used as listening labels.
