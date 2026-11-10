---
name: start-here
description: First run of a new album. Collect essentials, set up the user's project, connect Suno, and prepare the first round.
---

# Start here · version 2

## Begin

Say: “Tell me the album name, genre, and any track titles you have. I’ll set up the album, write the prompts, make the takes, and help you choose your favorites. I’ll use sensible defaults. You can change models, listening mode, budget, and sharing in Settings or by asking me.”

Extract all essentials already supplied. Ask for missing album name, genre and track titles together. Artist credit, mood and vocals are optional. If the user wants to move quickly, use a genre-appropriate instrumental default and state it once. Do not ask for an abstract album rule. Title humor stays out of Style prompts as a standing rule. If the user requests a small test, keep exactly one track, two prompts and one generation per prompt.

## Choose the path

- Quick start: Grok Bot writes five prompt variations per track; Suno generates audio. No Cursor installation or model API key is needed.
- Studio: a connected Cursor project may write selected prompt slots. Require verified execution and observed model information; otherwise offer a Cursor handoff or continue with Quick start.
- Small test: one track, two prompts, one generation per prompt, including download and voting.

The user's explicit request overrides these presets. The default site Settings page can change future rounds. Ask **“Should the album site be public, or private for you and people you invite?”** before publishing album content. Leave visibility unset until answered. Public means the listening page is open; private requires protected pages and private storage. Do not promise private sharing until it has been verified on a second browser.

## Accounts and preparation

Reuse existing sessions and entitlements. In dependency order, check [Grok Bot](https://x.ai/bot), [Suno](https://suno.com/pricing), [GitHub](https://github.com/pricing), and [Vercel](https://vercel.com/pricing). Ask the user to take over for each missing sign-in. Cursor is [optional](https://cursor.com/pricing). Vercel Hobby is limited to eligible personal, non-commercial use; check the [commercial-use rules](https://vercel.com/docs/limits/fair-use-guidelines). Check whether the connected Suno plan has enough _downloads_ as well as generation credits. Do not buy a plan on the user's behalf.

Create a repository from the kit in the user's GitHub account, with the kit as an upstream source. Use an existing suitable user-owned repo if they supplied one. A local or cloud checkout is fine. Do not put multiple users on branches of the upstream kit. Set `origin` to the user's repo and `kit` to the upstream repository. Verify both remotes. Preserve the installed kit commit ID in the handoff notes. If GitHub is not yet connected, prepare the local checkout and finish this step when the user signs in.

Install Node 24 and pnpm if needed. Connect the official Suno MCP server at `https://api.suno.com/mcp`; use a signed-in suno.com browser only if the connector cannot do the required operation. Verify available create, status, download, model and credit capabilities. A free MCP connection does not establish enough download allowance for hosted voting.

Create `album/album.json` with the title, optional artist, genre, starter set and the exact track titles with unique slugs. Keep `rule` as an empty legacy field if no actual musical constraint was supplied. Write `album/BRIEF.md` from the user's genre and sound choices. Include the standing Style rule: no title pun or joke-derived musical premise. Add actual user constraints, not invented ones.

Run `pnpm setup:site --name <album-slug>` for the Vercel project, database and **private** Blob store. It may require a browser handoff for the database. Existing public stores must be migrated before private visibility is enabled. Setup gives the owner key and URL; the key stays outside git. Confirm the owner can sign in at `/key` and reach `/settings`. Settings and the bot use the same authenticated `/api/owner/settings` record. Set visibility only after the owner has answered. Check the selected branch, project owner, environment and deployment. The URL is shareable only after visibility and access checks pass.

Before paid work, use `suno-run` preflight to resolve a supported model and show a compact estimate for generation credits, expected output count, download allowance, separate Cursor model spend if any, and hosting eligibility. Obtain one explicit round allowance. Continue through generation, download, upload and voting inside it.

## Check before saying done

- The user's repo and `kit` remotes are distinct; the checkout includes `album/album.json` and the skills.
- The album brief reflects the user's actual input; the prompt count matches the selected scope.
- Suno capability checks were made in the connected account; no retired model was assumed.
- The owner can reach Settings; publication visibility is the owner's answer.
- The site, storage and database belong to the user; private access works before claiming privacy.
- Any unresolved account connection or publication block is named precisely.
