---
name: suno-run
description: Preflight, authorize and run a track sheet's prompts through Suno; collect and upload every take without duplicate spending.
---

# Suno run · version 2

Use Suno's official MCP connector first. A signed-in suno.com browser is the fallback only when the connector lacks a required capability. The user handles sign-in or captcha. Do not suggest an unverified free browser download. A take is a full mix; only a split produces stems.

## Preflight

Read the track sheet and the current owner Settings from `/api/owner/settings`. Refresh Suno's available model list, quality default, credits per generation, outputs per generation, and remaining generation credits. Review does not spend downloads. Note remaining downloads only for a later final-file export. Do not use the sheet's old model if unavailable. Keep one resolved model for the round unless the owner specifically asks for a model comparison.

Call the owner round endpoint `/api/owner/rounds` with the current capability facts, verified hosting charge and eligibility, exact track count, and each prompt's track number, lane, ID, Style and writer attribution. Supply the generation cost's model ID separately from the rate. The route rejects missing prompt slots and title jokes in Style. Its snapshot and estimate include prompts, generations, expected outputs and generation credits. The download count is zero. Explain any model migration. Include separately billed Cursor prompt work and hosting eligibility. If generation credits are insufficient, stop before the first paid call. For a one-track Small test at two prompts and one standard two-output generation each, the illustrative estimate is 20 generation credits and no review downloads; verify actual account charging first. Review takes are published on Suno and streamed. They never spend a download.

Show the complete estimate once and obtain an explicit allowance for this round. Then authorize the saved round through `/api/owner/rounds/<id>/authorize` with `{ "approved": true }`. Saving a limit in Settings or importing a preset is not authorization. Continue through generation, status checks, stream storage and voting within the allowance, without a second approval for those included steps.

## Execute and resume

For each prompt and planned generation, create a stable operation ID and POST it to `/api/owner/rounds/<id>/jobs` **before** calling Suno. If the operation already exists, inspect it and resume; do not create another paid generation. Send only the sheet's Style paragraph, Title, resolved model and supported settings. If a required setting is missing, use the browser fallback for that prompt or stop precisely.

When Suno accepts the call, immediately PATCH the job with `status: accepted` and its provider job ID. Poll that ID until ready. If acceptance is ambiguous and no ID was saved, inspect Suno's history before any retry. When a clip has finished streaming, publish it with audio-settings `visibility: public`. A clip that is still streaming can answer `publish_pending: true`; wait until it is public before storing the stream. The playable review URL is `https://cdnN.suno.ai/<clip-id>.mp4`, the clip record's `video_url` from `https://studio-api.prod.suno.com/api/clip/<clip-id>`. Ignore `audio_url`; it is a placeholder and not playable media. Do not use CloudFront `media_urls` `.m4a` files. PATCH collection progress and outputs as `{ "takes": [{ "filename": "...", "outputId": "<clip id>", "clipId": "<clip id>", "streamUrl": "https://cdnN.suno.ai/<clip-id>.mp4", "downloaded": false, "uploaded": false }] }`; use `null` for an unavailable id. Never call audio-download for a take under review. An older `https://cdnN.suno.ai/<clip-id>.mp3` stream remains valid. Count actual takes, not just expected takes. Record each take's prompt ID, actual Suno model, generation ID, settings, clip id, stream URL and round through `/api/owner/provenance`. Represent unavailable metadata explicitly rather than guessing. Mark a job `complete` only when every actual take has a stored stream URL. A take that already has an uploaded file can still complete without one.

Do not download review takes. The site plays the stored public MP4 in its own player on Vote, Listen, Studio and `/final`, with the picture hidden, including scrubbing. Older Blob files and stored MP3 streams still play when that is what the take has. If a stored link is missing or is not that clip's public MP4, save the clips as `[{ "id" }]` (a playable `audio_url` is optional) and run `pnpm takes:refresh <clips.json>`. Refresh reads the studio clip record and stores `video_url` when `is_public` is true. If the clip is not public, it reports `publish the clip on Suno`. If capabilities differ from the estimate, pause only the affected step and show the precise difference; never silently expand the batch.

Only a final pick gets a real file. Export the WAV from Suno Studio when the account is Premier; Studio exports do not count toward the 60-song monthly download cap. Otherwise call audio-download once for that song, which counts as one download. Never use audio-download for a take that is still under review.

Before sending a voting link, POST `/api/owner/rounds/<id>/ready`. It verifies every planned job is complete and every recorded take has matching provenance and stored audio; report any named blocker it returns. Check actual output counts against the estimate, audio playback and the site's visibility. Run `pnpm owner:link /vote` in the album checkout and give the owner **Compare takes as owner** in their private chat. They tap **Continue as owner**. An owner link works once and expires in ten minutes. Create a fresh one if needed. Never paste the permanent album key into chat or a URL.

Read `listenerVoting` and `visibility` from `pnpm album:settings` before sharing.

- Public: share `/listen`. It plays final picks and, when listener voting is on, previews with links to Compare takes.
- Private: create a listener invitation with POST `/api/owner/invites` or Settings → Sharing. Its secret is in the URL fragment. It grants listener access only.
- Unset: keep the album unshared until the owner chooses visibility. Owner links still work.

If listening mode is blind, do not show identifying prompts or model details in chat, filenames, downloads or public routes. If the owner has already seen assignments, say the current round is exposed. Report meaningful events only: preparing, awaiting sign-in, generating after Suno acceptance, collecting audio, ready to listen, or a named blocker. Follow `publish` for sheet and log changes when permitted.
