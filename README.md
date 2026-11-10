# Album kit

Make an album with Suno, hear every take, and choose the winners on your own site. The album lives in `album/`; changing its title, tracks and sheets does not require changing site code. Grok Bot can run the basic workflow. Cursor is optional for a project handoff or verified model comparison.

## Start

Tell [Album Bot](grokbot/BOT.md): “Tell me the album name, genre, and any track titles you have.” It uses sensible defaults and asks for missing essentials together. Quick start writes five prompt variations per track. Ask for a **Small test** to make one track with two prompts and one Suno generation per prompt. The test still downloads takes and opens voting.

You will need your own [Grok Bot](https://x.ai/bot), [Suno](https://suno.com/pricing), [GitHub](https://github.com/pricing) and [Vercel](https://vercel.com/pricing) access. Existing entitlements may already cover some of these. Suno credits and song downloads are separate allowances; the bot checks both before a round. The site also uses Vercel Blob and a Postgres database through Neon. Check your account's storage and database terms. Vercel Hobby is for eligible [personal, non-commercial use](https://vercel.com/docs/limits/fair-use-guidelines); a commercial site may need a paid hosting plan. [Cursor](https://cursor.com/pricing) is optional and third-party model usage may be billed separately.

Before making music, the bot asks whether the site should be public or private, and whether only the owner votes or listeners can vote too. It shows one estimate covering generation, downloads, external prompt models if selected, and hosting eligibility. One round allowance covers generation through upload and voting. A settings limit or imported preset is never spending approval. Public opens the home page and Listen. Listen plays pinned takes. Voting stays owner-only until the owner turns listener voting on.

## Own the project

The default is a repository in **your** GitHub account, with this kit recorded as its upstream. The bot can use a local or cloud checkout. If you set it up yourself, use Node 24, pnpm, a signed-in `gh` CLI, Vercel CLI and Docker for local Postgres:

```bash
git clone https://github.com/sashakhad/album-kit my-album
cd my-album
git remote rename origin kit
gh repo create my-album --private --source . --remote origin --push
pnpm install
pnpm setup:site --name my-album
```

`setup:site` creates or links your Vercel project, a private Blob store for new projects, a Neon database and an owner key. It may hand a database sign-in step to you. The owner key is saved in ignored `.album-key`; `.album-site.json` holds the site URL, deployment path and kit revision without credentials. The deployed site starts with publication **unset** and listener voting **off**, so listeners cannot see the album until the owner chooses visibility in `/settings` or the bot updates the same authenticated settings API. To sign in on a browser or phone, open `<site-url>/key` and enter the owner key. A signed-in owner sees the key on that page and in Settings, with a copy button. Rotate it in the Vercel environment and redeploy; update the local ignored copy too. Do not send the key in a link.

An existing **public** Blob store cannot protect already uploaded objects by changing a site setting. Migrate takes into a private Blob store and retire the old public objects before selecting Private; Settings requires a verified private store and `PRIVATE_BLOB_AUDITED=true` after that audit. New setup sets this flag because it creates no earlier public take store. Private listening invites are one-use links that expire after 15 minutes. The link secret is in the URL fragment, removed on opening, and exchanged for a revocable viewer cookie. Viewers can hear pinned takes. They can vote only when listener voting is on, and those scores stay separate from the owner's. They cannot change Settings. Test access on a second browser before sharing.

## Settings and rounds

The owner-only `/settings` page controls the Suno model policy, prompt writer, variation and generation counts, listening details, sound and vocals, round limits, visibility, listener voting and invitations. Settings are stored once in Postgres and are available to the bot through `/api/owner/settings` with the owner key as a Bearer token. User defaults and album overrides are separate fields. An exported preset is versioned and contains no credentials, album content, publication choice, listener voting or approval.

Auto resolves against the connected Suno account's supported quality model before each round. [Suno currently recommends v6](https://help.suno.com/en/articles/13924737) for eligible accounts; that version is not pinned forever. Grok Bot prompt records say **model undisclosed**. A Cursor model label is verified only from its runtime output. The site has no Cursor execution adapter yet, so selecting Cursor requires a real Cursor handoff and a verified external estimate before a paid round can begin.

Visible listening shows saved prompt provenance. Reveal after voting waits until every available take has a vote in the round. Keep hidden omits those details from voting. Blind voting saves a randomized order, uses neutral labels and opaque audio URLs, and omits filenames and prompt details from the browser payload. Deliberately opening Studio records exposure, so later votes can be interpreted correctly. New uploads strip common MP3 metadata; migrate or scrub older takes before claiming a legacy round is blind.

The bot saves each round's settings, resolved model, capability snapshot, estimate and authorization. It records operation IDs before Suno calls, and provider IDs after acceptance. Retry a known job by polling it, not by making another paid generation. Per-take provenance is recorded through `/api/owner/provenance`; missing model information stays explicitly unverified.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm exec prisma migrate deploy
pnpm dev
```

The local example key is `dev`; sign in at `http://localhost:3000/key`. With no Blob connection, put canonical MP3 files in `album/audio/`. The site does not generate music by itself; the official Suno MCP connector or signed-in Suno browser runs the prompts. Use `pnpm takes:upload <files...>` for hosted upload. It uses a Blob token if available, otherwise the owner site's upload API and ignored `.album-key`.

Run `pnpm check` for formatting, lint, types and tests. Run `pnpm publish:album "message"` after a permitted album change. Verify the deployment branch, owner, environment and working URL before sharing.

## Boundaries

- A take is a full mix. Stems are separate files created by a split.
- No title joke or joke-derived musical premise goes in a Suno Style prompt.
- The owner judges takes; the bot does not choose winners.
- No live Suno credits or third-party model spend are used by repository tests.
