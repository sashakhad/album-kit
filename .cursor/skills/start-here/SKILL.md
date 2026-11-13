---
name: start-here
description: First run of a new album. Collect essentials, set up the user's project, connect Suno, and prepare the first round.
---

# Start here · version 3

## Readiness and resume

At the first message, inspect the actual tools and sessions available to the bot for Suno, Vercel and (if Studio was requested) Cursor. Do not equate an installed app, an old chat claim or a connected MCP server with a signed-in account and working capabilities. Once the album checkout exists, run `pnpm onboarding status` from it. It probes the local Cursor installation, Vercel CLI sign-in, GitHub CLI sign-in, album file, distinct remotes and local site record, and displays one next step. It does not verify that a remote is owned by this user or that the saved site URL is live; check those separately. Its ignored `.album-onboarding.json` stores only checkpoints, never credentials or codes. Run it again at the start of a resumed chat and before a step that needs Suno, Cursor or Vercel. A stale Suno check is not sufficient for generation.

Present progress as “setup preparation X/Y” and one actionable next step. Finish that step, verify the result, then show the next. If a handoff is pending, keep its step pending; do not advance from an opened sign-up page, submitted form, or sent code. Do not claim that setup is complete until the deployed site, owner access, audio, and Compare takes are verified. The checkpoint's final “run preflight” step is a boundary before music generation, not a completion claim.

For a missing account or connector, use supported bot tools or a browser to open the provider's own sign-up or connection flow and fill safe non-secret fields if possible. Hand the session to the owner for passwords, passkeys, verification codes, captchas and provider consent. Ask them to enter codes directly in the provider page, never in chat or the checkpoint file. Resume only after a fresh account/capability check succeeds. If a plan appears necessary, show the provider's current plan, price, billing period, expected charge and what capability is missing. Obtain explicit approval for that purchase and let the owner complete the provider checkout; recheck the entitlement after payment. Do not interpret a Settings limit, general setup permission or a previous round allowance as purchase approval. If a connector cannot be installed or inspected from this runtime, say exactly which check is unavailable and offer the supported signed-in browser path; keep the item unverified until the required operation works.

The bot runs routine Git, project, database, storage, environment and deployment commands in the creator's own accounts after access is available. Give the owner a single provider handoff only for identity, terms, consent or payment steps they must personally complete. Do not make the creator configure PostgreSQL, Neon variables or Vercel settings by hand when the supported setup command can do it. The current kit setup uses a separate creator-controlled repository, deployment, database and provider accounts. Do not present that implementation path as a final multi-owner hosting decision.

## Begin

Say: “Tell me the album name, genre, and any track titles you have. I’ll set up the album, write the prompts, make the takes, and help you choose your favorites. I’ll use sensible defaults. You can change models, listening mode, budget, and sharing in Settings or by asking me.”

Extract all essentials already supplied. Ask for missing album name, genre and track titles together. Artist credit, mood and vocals are optional. If the user wants to move quickly, use a genre-appropriate instrumental default and state it once. Do not ask for an abstract album rule. Title humor stays out of Style prompts as a standing rule. If the user requests a small test, keep exactly one track, two prompts and one generation per prompt.

## Choose the path

- Quick start: Grok Bot writes five prompt variations per track; Suno generates audio. No Cursor installation or model API key is needed.
- Studio: a connected Cursor project may write selected prompt slots. Require verified execution and observed model information; otherwise offer a Cursor handoff or continue with Quick start.
- Small test: one track, two prompts, one generation per prompt, including download and voting.

The user's explicit request overrides these presets. The default site Settings page can change future rounds. Ask two questions before publishing album content, and leave both answers unset until the owner answers.

1. **“Should the album site be public, or private for you and people you invite?”**
   - Public means anyone can open the home page and Listen. Listen plays the owner’s chosen or highest-scored takes. Enabling listener voting also lets people preview current takes.
   - Private means only the owner and people who open an invitation can see the home page and Listen. An invitation does not include the album key.
   - Neither answer lets other people vote, upload, move takes, or open Studio or Settings.
     Leave visibility unset until answered. Private requires protected pages and private storage. Do not promise private sharing until it has been verified on a second browser.

2. **“Who should be able to vote on takes: only you, or you and listeners?”**
   - Only the owner, the default: send an owner link from `pnpm owner:link /vote` in the owner’s private chat. They tap Continue as owner. Never paste the permanent album key into chat or a URL.
   - Listeners too: people who can already hear the album can score takes. On a public album that is any visitor. On a private album that is someone with an invitation. Their scores stay on separate ballots and do not change the owner's scores, picks, pins, or rounds. The owner still pins takes, moves them, and uses Studio and Settings.

Set both through the authenticated `/api/owner/settings` record, for example `{ "patch": { "visibility": "public", "listenerVoting": false } }`. `listenerVoting` stays false until the owner asks for listeners to vote.

## Accounts and preparation

Reuse existing sessions and entitlements. In dependency order, check [Grok Bot](https://x.ai/bot), [Suno](https://suno.com/pricing), [GitHub](https://github.com/pricing), and [Vercel](https://vercel.com/pricing). Cursor is [optional](https://cursor.com/pricing) for Quick start and required only for the requested Studio model path. Vercel Hobby is limited to eligible personal, non-commercial use; check the [commercial-use rules](https://vercel.com/docs/limits/fair-use-guidelines). Check whether the connected Suno plan has enough _downloads_ as well as generation credits. Do not buy a plan on the user's behalf.

Create a repository from the kit in the user's GitHub account, with the kit as an upstream source. Use an existing suitable user-owned repo if they supplied one. A local or cloud checkout is fine. Do not put multiple users on branches of the upstream kit. Set `origin` to the user's repo and `kit` to the upstream repository. Verify both remotes. Preserve the installed kit commit ID in the handoff notes. If GitHub is not yet connected, prepare the local checkout and finish this step when the user signs in.

Install Node 24 and pnpm if needed. Connect the official Suno MCP server at `https://api.suno.com/mcp`; use a signed-in suno.com browser only if the connector cannot do the required operation. Verify available create, status, download, model and credit capabilities in the owner's account. A free MCP connection does not establish enough download allowance for hosted voting. Immediately after a successful live check, record it with `pnpm onboarding verify-suno mcp create status download models credits` (use `browser` instead of `mcp` only when those capabilities were verified in the signed-in browser). The checkpoint expires after 30 minutes, so repeat the live check and command before dependent work. Never run `verify-suno` from a guessed or stale plan.

For Studio, run `pnpm onboarding path studio`. Check Cursor installation and a connected Project execution, including the actual model from runtime output; then record it with `pnpm onboarding verify-cursor '<observed model>'`. This command records the observed label; it does not run Cursor or prove a model by itself. If Studio cannot be verified, keep it pending or switch to Quick start with `pnpm onboarding path quick` after the owner chooses. Do not treat `cursor --version` alone as a connection.

Create `album/album.json` with the title, optional artist, genre, starter set and the exact track titles with unique slugs. Keep `rule` as an empty legacy field if no actual musical constraint was supplied. Write `album/BRIEF.md` from the user's genre and sound choices. Include the standing Style rule: no title pun or joke-derived musical premise. Add actual user constraints, not invented ones.

Run `pnpm setup:site --name <album-slug>` for the Vercel project, database and **private** Blob store. It may require a browser handoff for the database. Existing public stores must be migrated before private visibility is enabled. Setup gives the owner key and URL; the key stays outside git and out of chat. Run `pnpm owner:link /settings` from the album checkout and offer **Open album settings** in the owner’s private chat. The link is single use and expires in ten minutes. Confirm the owner can reach Settings. In Settings, **Owner access** can create another owner link or reveal the album key. The website and `pnpm album:settings` use the same authenticated `/api/owner/settings` record in the album database. Set visibility and `listenerVoting` only after the owner has answered. Check the selected branch, project owner, environment and deployment. The URL is shareable only after visibility and access checks pass.

After the owner actually reaches Settings, run `pnpm onboarding confirm-owner-access`. This stores the current site URL so a later project change makes that checkpoint pending again. Resume an interrupted Vercel or Neon setup by checking the live account and rerunning `pnpm setup:site`; its existing project and environment checks avoid starting over.

Before paid work, use `suno-run` preflight to resolve a supported model and show a compact estimate for generation credits, expected output count, download allowance, separate Cursor model spend if any, and hosting eligibility. Obtain one explicit round allowance. Continue through generation, download, upload and voting inside it.

## Check before saying done

- The user's repo and `kit` remotes are distinct; the checkout includes `album/album.json` and the skills.
- The album brief reflects the user's actual input; the prompt count matches the selected scope.
- Suno capability checks were made in the connected account; no retired model was assumed.
- The owner can reach Settings. Publication visibility and listener voting are the owner's answers, and stay unset or off if they have not answered.
- Owner handoff links open the requested page as owner. Use listener links only for sharing. Do not paste the album key.
- The site, storage and database belong to the user; private access works before claiming privacy.
- Any unresolved account connection or publication block is named precisely.
