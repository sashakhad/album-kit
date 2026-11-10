---
name: suno-run
description: Preflight, authorize and run a track sheet's prompts through Suno; collect and upload every take without duplicate spending.
---

# Suno run · version 2

Use Suno's official MCP connector first. A signed-in suno.com browser is the fallback only when the connector lacks a required capability. The user handles sign-in or captcha. Do not suggest an unverified free browser download. A take is a full mix; only a split produces stems.

## Preflight

Read the track sheet and the current owner Settings from `/api/owner/settings`. Refresh Suno's available model list, quality default, credits per generation, outputs per generation, download charge per output, remaining generation credits and remaining downloads. Do not use the sheet's old model if unavailable. Keep one resolved model for the round unless the owner specifically asks for a model comparison.

Call the owner round endpoint `/api/owner/rounds` with the current capability facts, verified hosting charge and eligibility, exact track count, and each prompt's track number, lane, ID, Style and writer attribution. Supply the generation cost's model ID separately from the rate. The route rejects missing prompt slots and title jokes in Style. Its snapshot and estimate include prompts, generations, expected outputs, generation credits and downloads. Explain any model migration. Include separately billed Cursor prompt work and hosting eligibility. If downloads or generation credits are insufficient, stop before the first paid call. For a one-track Small test at two prompts and one standard two-output generation each, the illustrative estimate is 20 generation credits and four downloads; verify actual account charging first.

Show the complete estimate once and obtain an explicit allowance for this round. Then authorize the saved round through `/api/owner/rounds/<id>/authorize` with `{ "approved": true }`. Saving a limit in Settings or importing a preset is not authorization. Continue through generation, status checks, downloads, upload and voting within the allowance, without a second approval for those included steps.

## Execute and resume

For each prompt and planned generation, create a stable operation ID and POST it to `/api/owner/rounds/<id>/jobs` **before** calling Suno. If the operation already exists, inspect it and resume; do not create another paid generation. Send only the sheet's Style paragraph, Title, resolved model and supported settings. If a required setting is missing, use the browser fallback for that prompt or stop precisely.

When Suno accepts the call, immediately PATCH the job with `status: accepted` and its provider job ID. Poll that ID until ready. If acceptance is ambiguous and no ID was saved, inspect Suno's history before any retry. PATCH collection progress and outputs as `{ "takes": [{ "filename": "...", "outputId": "...", "downloaded": false, "uploaded": false }] }`; use `null` for unavailable output IDs. Count actual takes, not just expected takes. Record each take's prompt ID, actual Suno model, generation ID, settings, output ID and round through `/api/owner/provenance`. Represent unavailable metadata explicitly rather than guessing. Mark a job `complete` only when every actual take is downloaded and uploaded.

Download every take in the authorized allowance once. Save it under the canonical filename from the sheet in `album/audio/`, then use `pnpm takes:upload <files...>`. The uploader skips existing names. It strips Suno tags. If downloads, uploads or capabilities differ from the estimate, pause only the affected step and show the precise difference; never silently expand the batch.

Before sending a voting link, POST `/api/owner/rounds/<id>/ready`. It verifies every planned job is complete and every recorded take has matching provenance and stored audio; report any named blocker it returns. Check actual output counts against the estimate, audio playback and the site's visibility. Send the owner `$SITE/vote`. Tell them to open `$SITE/key` while signed in, or Settings, to see and copy the album key onto another device. Never paste the key into chat, and never put it in a URL.

Read `listenerVoting` and `visibility` from `/api/owner/settings` before you say who else can vote.

- When listener voting is off, say that `/vote` signs in the owner. Someone else who opens it sees the key page, which points them to Listen.
- When listener voting is on and the album is public, friends can open the same `/vote` link and vote without the key. Their scores stay off the owner's ballot.
- When listener voting is on and the album is private, create an invitation with POST `/api/owner/invites` and send that link. The secret is in the fragment after `#`, not in a query string. The invitation lets them listen and vote. It is not the owner key.

If listening mode is blind, do not show identifying prompts or model details in chat, filenames, downloads or public routes. If the owner has already seen assignments, say the current round is exposed. Report meaningful events only: preparing, awaiting sign-in, generating after Suno acceptance, collecting audio, ready to listen, or a named blocker. Follow `publish` for sheet and log changes when permitted.
