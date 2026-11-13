---
name: start-here
description: First run of a new album. Collect essentials, set up the user's project, connect Suno, and prepare the first round.
---

# Start here · version 5

## Begin

Say: “Tell me the album name, genre, and any track titles you have. I’ll set up the album, write the prompts, make the takes, and help you choose your favorites. I’ll use sensible defaults. You can change models, listening mode, budget, sharing, and whether review takes are public on Suno in Settings or by asking me.”

Extract all essentials already supplied. Ask for missing album name, genre and track titles together. Artist credit, mood and vocals are optional. If the user wants to move quickly, use a genre-appropriate instrumental default and state it once. Do not ask for an abstract album rule. Title humor stays out of Style prompts as a standing rule. If the user requests a small test, keep exactly one track, two prompts and one generation per prompt.

## Choose the path

- Quick start: Grok Bot writes five prompt variations per track; Suno generates audio. No Cursor installation or model API key is needed.
- Studio: a connected Cursor project may write selected prompt slots. Require verified execution and observed model information; otherwise offer a Cursor handoff or continue with Quick start.
- Small test: one track, two prompts, one generation per prompt, including streaming and voting.

The user's explicit request overrides these presets. The default site Settings page can change future rounds. Ask the sharing questions before publishing album content, and leave both answers unset until the owner answers. Ask the review-take question in the same first-run setup. `reviewTakes` stays `public` until the owner chooses private.

1. **“Should the album site be public, or private for you and people you invite?”**
   - Public means anyone can open the home page and Listen. Listen plays the owner’s chosen or highest-scored takes. Enabling listener voting also lets people preview current takes.
   - Private means only the owner and people who open an invitation can see the home page and Listen. An invitation does not include the album key.
   - Neither answer lets other people vote, upload, move takes, or open Studio or Settings.
     Leave visibility unset until answered. Private requires protected pages and private storage. Do not promise private sharing until it has been verified on a second browser.

2. **“Who should be able to vote on takes: only you, or you and listeners?”**
   - Only the owner, the default: send an owner link from `pnpm owner:link /vote` in the owner’s private chat. They tap Continue as owner. Never paste the permanent album key into chat or a URL.
   - Listeners too: people who can already hear the album can score takes. On a public album that is any visitor. On a private album that is someone with an invitation. Their scores stay on separate ballots and do not change the owner's scores, picks, pins, or rounds. The owner still pins takes, moves them, and uses Studio and Settings.

3. **How should review takes play?** Ask this as one single-choice question widget card, with the recommended option first. Before the card, say:

   > Downloading a song from Suno uses Suno download credits, which are limited per month. The site can play review takes without downloading, by streaming each take’s public MP4 from Suno. I recommend letting me make review takes public on Suno. Only final picks get downloaded. You can switch songs back to private on Suno later. A take that’s private on Suno stops playing on the site, so the best time is after picks are final, and only for takes that are no longer needed for listening. Final picks are stored as real files.

   Card options, recommended first:

   - Make review takes public on Suno (recommended)
   - Keep them private and download takes (uses download credits)

Set visibility and listener voting through the authenticated `/api/owner/settings` record, for example `{ "patch": { "visibility": "public", "listenerVoting": false } }`. `listenerVoting` stays false until the owner asks for listeners to vote. Save the review-take answer on that same record: `{ "patch": { "reviewTakes": "public" } }` or `{ "patch": { "reviewTakes": "private" } }`. Leave `reviewTakes` at its default `public` when the owner has not answered. Public means publish each review take and stream its MP4. Private means leave it private on Suno and download it, which spends download credits per take.

## Accounts and preparation

Reuse existing sessions and entitlements. In dependency order, check [Grok Bot](https://x.ai/bot), [Suno](https://suno.com/pricing), [GitHub](https://github.com/pricing), and [Vercel](https://vercel.com/pricing). Ask the user to take over for each missing sign-in. Cursor is [optional](https://cursor.com/pricing). Vercel Hobby is limited to eligible personal, non-commercial use; check the [commercial-use rules](https://vercel.com/docs/limits/fair-use-guidelines). Check whether the connected Suno plan has enough generation credits. When review takes stay public, review does not spend download credits. When the owner keeps them private, the round also needs download credits for every take. Do not buy a plan on the user's behalf.

Create a repository from the kit in the user's GitHub account, with the kit as an upstream source. Use an existing suitable user-owned repo if they supplied one. A local or cloud checkout is fine. Do not put multiple users on branches of the upstream kit. Set `origin` to the user's repo and `kit` to the upstream repository. Verify both remotes. Preserve the installed kit commit ID in the handoff notes. If GitHub is not yet connected, prepare the local checkout and finish this step when the user signs in.

Install Node 24 and pnpm if needed. Connect the official Suno MCP server at `https://api.suno.com/mcp`; use a signed-in suno.com browser only if the connector cannot do the required operation. Verify available create, status, model and credit capabilities. When `reviewTakes` is public, review takes stream from a public Suno MP4, so that round does not need download allowance. When it is private, the round needs download credits per take.

Create `album/album.json` with the title, optional artist, genre, starter set and the exact track titles with unique slugs. Keep `rule` as an empty legacy field if no actual musical constraint was supplied. Write `album/BRIEF.md` from the user's genre and sound choices. Include the standing Style rule: no title pun or joke-derived musical premise. Add actual user constraints, not invented ones.

Run `pnpm setup:site --name <album-slug>` for the Vercel project, database and **private** Blob store. It may require a browser handoff for the database. Existing public stores must be migrated before private visibility is enabled. Setup gives the owner key and URL; the key stays outside git and out of chat. As soon as setup prints `Milestone: Site created.` and the site URL, send that sentence to the owner. Do not wait for prompts or generation, and do not paste the JSON line that follows it. That line contains the album key. Then run `pnpm owner:link /settings` from the album checkout. It prints `Site:` and `Owner:`. Offer **Open album settings** in the owner’s private chat and paste both lines in that same message. Every setup and round message includes the site URL. When visibility is private or still unset, that same message includes the owner link. The owner link's secret stays in the URL fragment. Never put the album key in the message or in a query string. The link works once and stays valid for 7 days. After Continue as owner, that browser stays signed in. Confirm the owner can reach Settings. After settings are saved, say which values were saved. The owner can watch `<site>/status` while later steps run. Do not go silent between these milestones. In Settings, **Owner access** can create another owner link or reveal the album key. The website and `pnpm album:settings` use the same authenticated `/api/owner/settings` record in the album database. Set visibility and `listenerVoting` only after the owner has answered. Set `reviewTakes` from the question widget card, and leave the default `public` if they have not answered. Check the selected branch, project owner, environment and deployment. The URL is shareable only after visibility and access checks pass.

Before paid work, use `suno-run` preflight to resolve a supported model and show a compact estimate for generation credits, expected output count, separate Cursor model spend if any, and hosting eligibility. When review takes are private, that estimate also shows download credits per take. Obtain one explicit round allowance. Continue through generation, streaming or downloading, and voting inside it. On the public path, download credits are only for a final song file.

## Check before saying done

- The user's repo and `kit` remotes are distinct; the checkout includes `album/album.json` and the skills.
- The album brief reflects the user's actual input; the prompt count matches the selected scope.
- Suno capability checks were made in the connected account; no retired model was assumed.
- The owner can reach Settings. Publication visibility and listener voting are the owner's answers, and stay unset or off if they have not answered. `reviewTakes` is `public` unless the owner chose private on the question widget card.
- Owner handoff links open the requested page as owner. Use listener links only for sharing. Do not paste the album key.
- The site, storage and database belong to the user; private access works before claiming privacy.
- Any unresolved account connection or publication block is named precisely.
