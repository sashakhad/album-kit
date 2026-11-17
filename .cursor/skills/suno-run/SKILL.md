---
name: suno-run
description: Preflight, authorize and run a track sheet's prompts through Suno; collect and upload every take without duplicate spending.
---

# Suno run · version 10

Use Suno's official MCP connector first. A signed-in suno.com browser is the fallback only when the connector lacks a required capability. The user handles sign-in or captcha. Do not suggest an unverified free browser download. A take is a full mix; only a split produces stems.

## What to say about cost

Check the Suno credit balance silently before generating. Do not mention cost by default.

When you do mention credits or a price, say "Suno credits", or name the actual currency or plan. Never say a bare "credits".

Only bring up cost when it matters:

- The planned run would use more than about 20% of the Suno credits left, or would leave fewer than about 100.
- The account is on Suno Free. The daily limit is 50 Suno credits. Say how many songs are left today only when that limit changes the plan.
- One step would spend a lot, for example over 200 Suno credits.
- It costs real money, such as an upgrade or extra credits.

With plenty of Suno credits, thousands of them, just go. No number. The first time, use the game plan in `start-here`: two or three short sentences that you are writing the songs and making the takes on Suno, building their album page where they can listen, vote takes up or down, and share it with friends, and that you will only stop if they need to sign in or enter a card. Then proceed. Do not say a cost estimate is ready, and do not wait for a cost OK, unless this section says cost matters. A later round can be as short as "Making two quick tracks, four takes each." When the site goes live, send the link with one line: "Your album page is up. Listen to every take, vote them up or down, and share it with friends."

`/cost` and `/settings` still show the numbers when asked. Keep computing the round estimate for the API. Speak it only when this section says cost matters, or when they ask.

## Preflight

Read the track sheet and the current owner Settings from `/api/owner/settings`. Follow the `reviewTakes` value saved on the round snapshot. It defaults to `public` when the owner has not chosen, including an older snapshot that omits the field. Refresh Suno's available model list, quality default, credits per generation, outputs per generation, remaining generation credits, download credits per take, and remaining download credits. Public review does not spend downloads; private review spends them per take. Use the saved `sunoModel` policy unless the owner requests a one-round choice; then send `sunoModelOverride` in `POST /api/owner/rounds`. If a saved model is unavailable, preflight blocks the round even when it names an alternative. Let the owner update Settings or explicitly request a one-round override after the capability and cost check. Do not use the sheet's old model if unavailable. Keep one resolved model for the round unless the owner specifically asks for a model comparison.

Call the owner round endpoint `/api/owner/rounds` with the current capability facts, verified hosting charge and eligibility, exact track count, and each prompt's track number, lane, ID, Style and writer attribution. Supply the generation cost's model ID separately from the rate. The route rejects the body when any of these is missing, and nothing on the server fills them in:

- `capabilities.costModel`: the model id the generation-credit rate was checked for. It must be the resolved Suno model, or the estimate blocks.
- `capabilities.downloadsPerOutput`: download credits charged for one take on this account. Send the checked rate even when `reviewTakes` is `public`. The estimate then sets the download totals to zero.
- `hostingEligibilityVerified`: `true`, only after hosting eligibility was checked. Also send `hostingChargeEstimateUsd` (0 when the free tier covers this site).

A missing `costModel`, `downloadsPerOutput`, or `hostingEligibilityVerified` is a 400. The route rejects missing prompt slots and title jokes in Style. Its snapshot and estimate include prompts, generations, expected outputs, generation credits, `downloadsPerTake`, and total `downloads`. When `reviewTakes` is `public`, both download figures are zero. When `reviewTakes` is `private`, `downloadsPerTake` is the account's download-credit charge for one take and `downloads` is that charge times the expected take count. Say the Suno download credits per take before they approve a private round only when that cost matters. Explain any model migration. Include separately billed Cursor prompt work and hosting eligibility in the silent check, and say them only when that cost matters. If Suno generation credits are insufficient, stop before the first paid call. If review takes are private and Suno download credits are short of the per-take charge, stop before the first paid call. A Small test is one or two tracks. Each track is two prompts and one standard two-output generation, about 20 Suno generation credits per track. One track is about 20 Suno credits; two tracks are about 40 Suno credits. Those numbers stay in the silent check unless cost matters. Prompt lane numbers start over every round. `promptVariations` is how many slots that round has, so a second round is p1 and p2 again. New takes get new letters. A repeated p1 is not the first round's prompt. Public review adds no Suno download credits. Private review adds the account's Suno download credits per take (4 Suno download credits when the rate is one per take). Verify actual account charging first.

When cost does not matter, do not read the estimate aloud and do not ask. Say what you are making, with no number, then authorize the saved round through `/api/owner/rounds/<id>/authorize` with `{ "approved": true }`. When cost matters, say the Suno credit numbers, then ask once before that authorize call. Saving a limit in Settings or importing a preset is not authorization. Continue through generation, status checks, public stream storage or private take downloads, and voting within the round, without a second approval for those included steps.

## More like this requests

The owner can save a **More like this** request from Compare takes. `GET /api/owner/variations` lists durable requests with the selected track, parent filename, target number of new takes, optional edit instructions, status and linked round. Process only `requested` items; a `canceled` item is a tombstone that blocks a delayed retry. A saved request is a handoff, not Suno authorization. Do not start generation because a request exists. Keep any existing generation HOLD in force.

A request saved during a blind pass carries an opaque parent token in the owner response. The variation round route rejects planning while the pass remains blind. Wait for the pass to be revealed, then reread the request to obtain the canonical parent. Do not bypass the blind state by resolving the token through files, database access or another owner endpoint.

For a requested item, follow `song-prompts`: read the album brief and current owner constraints as context, then use the selected track sheet and parent take's saved provenance for the revision. Write a revised Style prompt that applies the owner's instructions while preserving the title-joke rule. Record the prompt writer's actual host, provider and observed model; leave unverifiable fields null. Use `POST /api/owner/rounds` with `variationRequestId`, `tracks: 1`, and exactly one prompt for the selected `trackNumber`. This route fixes the plan to one track and calculates the number of Suno calls from `requestedTakes` and the freshly checked outputs per generation. Its estimate may include more outputs than the target because Suno returns batches. Check the actual calls, expected outputs, Suno credits, Suno downloads, external prompt cost and hosting charge silently. Say them before asking only when **What to say about cost** says it matters. Otherwise say what you are making, with no number, and continue. Repeat preflight if capabilities or the approval context changed. Never reinterpret the request count as an allowance to spend.

After approval, use the normal operation-ID ledger and collection procedure below. Assign each new take an unused canonical letter for that same track and set. Never reuse an old letter. Save its prompt and file in the selected track sheet, then call `/api/owner/provenance` for each output. The round snapshot supplies the parent filename, request ID and edit instructions to each take's saved provenance. `POST /api/owner/rounds/<id>/ready` marks the request ready only after the normal audio and provenance audit passes. The new files then appear under the selected track in Compare takes. If execution is unavailable, report the request as pending; do not show a completed generation state.

## Execute and resume

Submit every generation in the authorized round at once. Do not wait for one track to finish before starting another, and do not add prompts or generations beyond the allowance.

When the album site is live and the round is authorized, create a stable operation ID for each prompt and planned generation and POST it to `/api/owner/rounds/<id>/jobs` **before** calling Suno. If the operation already exists, inspect it and resume; do not create another paid generation. Record every job first, then start those Suno calls together.

When the site does not exist yet, generate first and register the jobs afterward. That is the backfill. `pnpm setup:site` cannot record a job until it prints `Milestone: Site created.` It exits 2 with `Not signed in to Vercel. Run: npx vercel login` when the Vercel CLI is signed out, and it runs `vercel integration add neon` when `DATABASE_URL` is missing. Exit 3 means finish Neon in the browser. Do not wait on that login to run an authorized round, and do not spend the round twice. How the owner signs the CLIs in, and the no-CLI path, are in `start-here`.

Backfill steps:

1. Before each Suno call, keep a local ledger row: operation ID, prompt ID, and, the moment Suno accepts, the provider job ID. Add clip IDs and stream URLs when the takes finish. Never send another paid request for an operation ID already in the ledger.
2. After the site exists and the round is authorized, POST each saved operation ID to `/api/owner/rounds/<id>/jobs`, then PATCH that job `accepted` with the saved provider job ID and its takes. The POST-then-PATCH does not generate again.
3. Continue with provenance, `complete`, and `ready` as usual.

For an instrumental sheet (the default when `vocals` is `instrumental`), send the Style paragraph, Title, resolved model, `instrumental: true`, and supported settings. Do not send lyrics. When vocals are wanted, the sheet holds original lyrics from `song-prompts`. Send those in Suno's custom mode: the `lyrics` field, plus `style` (the Style paragraph) and `title`. Do not also send `description`. Mixing `description` with `lyrics` or `style` is rejected. If a required setting is missing, use the browser fallback for that prompt or stop precisely.

## Suno Free / browser

Suno Free is not an edge case of a failed connector. `https://api.suno.com/mcp` refuses Free and new accounts. The account sees that connecting AI apps is not available yet. Do not tell a Free tester to add the connector. Make the songs on suno.com in the bot's browser after the tester signs in there.

Free facts, checked on a non-Sasha Free account:

- Model v6-mini only. A song is about 45–55 seconds.
- 10 Suno credits per Create, 2 takes per Create, 50 Suno credits a day, no downloads.
- Each Create also adds 2 locked V6 PREVIEW teasers that need an upgrade. Ignore them. They cannot be published.
- The UI shows no Suno credit balance. `account-usage` needs the connector, so do not call it. Read a balance from the UI when it is shown. Otherwise use the 50 Suno credit daily cap for the silent check. Say how many songs are left today only when that cap limits the plan.
- Capability body for `POST /api/owner/rounds`: `sunoModel` and `costModel` are `v6-mini`, `creditsPerGeneration` is 10, `outputsPerGeneration` is 2, `downloadsPerOutput` is 0, `generationCreditsAvailable` is 50 when the UI does not show a balance, `downloadsAvailable` is 0, `availableModels` is `["v6-mini"]`, `qualityDefault` is `v6-mini`.

How to register a browser take:

1. The song URL on suno.com ends in the clip id. That id is the clip id and the output id.
2. A Create has no job id. `generationId` is the first clip id of that Create's two real takes. Use that same id as the provider job id when you PATCH the job.
3. The stream is the clip's `video_url`. Store `https://cdnN.suno.ai/<clip-id>.mp4`. A published MP4 returns 206. The `.mp3` for that id returns 403. Do not store the mp3.
4. Publish the song in the suno.com UI. Until it is public, the MP4 does not play. There is no download on Free.
5. POST `/api/owner/provenance` with `style` set to the Style you typed. That value has to match the round snapshot. Suno rewrites Style, so each clip's tags differ. Put those tags in `clipTags`. Set `generationPath` to `browser`. `writerHost` stays `grok-bot` or `cursor`. The route stores `generationPath` as `generationSettings.path` and `clipTags` as `generationSettings.clipTags`.

When Suno accepts a call, immediately PATCH that job with `status: accepted` and its provider job ID. Wait on the accepted jobs together. If acceptance is ambiguous and no ID was saved, inspect Suno's history before any retry. Do not send another paid request for a job that already has an operation ID.

When `reviewTakes` is `public`, publish the clip once it has finished streaming, with audio-settings `visibility: public`. A clip that is still streaming can answer `publish_pending: true`; wait until it is public before storing the stream. The playable review URL is `https://cdnN.suno.ai/<clip-id>.mp4`, the clip record's `video_url` from `https://studio-api.prod.suno.com/api/clip/<clip-id>`. Ignore `audio_url`; it is a placeholder and not playable media. Do not use CloudFront `media_urls` `.m4a` files. PATCH collection progress and outputs as `{ "takes": [{ "filename": "...", "outputId": "<clip id>", "clipId": "<clip id>", "streamUrl": "https://cdnN.suno.ai/<clip-id>.mp4", "downloaded": false, "uploaded": false }] }`; use `null` for an unavailable id. Never call audio-download for a take under review. An older `https://cdnN.suno.ai/<clip-id>.mp3` stream remains valid.

When `reviewTakes` is `private`, do not publish the clip and do not store a Suno stream URL. Call audio-download once per take, upload that file, and PATCH the take as `{ "filename": "...", "outputId": "<clip id>", "clipId": "<clip id>", "streamUrl": null, "downloaded": true, "uploaded": true }`. Each of those downloads spends the estimate's Suno download credits per take. Mention that spend only when cost matters. A song that stays private on Suno stops playing on the site, which is why this path stores a real file instead of a stream.

Count actual takes, not just expected takes. Record each take's prompt ID, actual Suno model, generation ID, settings, clip id, stream URL when the take is public, and round through `/api/owner/provenance`. Represent unavailable metadata explicitly rather than guessing. Mark a job `complete` only when every public review take has a stored stream URL, or every private review take has an uploaded file. A take that already has an uploaded file can still complete without a stream.

When review takes are public, do not download them. The site plays the stored public MP4 in its own player on Vote, Listen, Studio and `/final`, with the picture hidden, including scrubbing. Older Blob files and stored MP3 streams still play when that is what the take has. If a stored link is missing or is not that clip's public MP4, save the clips as `[{ "id" }]` (a playable `audio_url` is optional) and run `pnpm takes:refresh <clips.json>`. Refresh reads the studio clip record and stores `video_url` when `is_public` is true. If the clip is not public, it reports `publish the clip on Suno`. If capabilities differ from the estimate, pause only the affected step and show the precise difference; never silently expand the batch. When review takes are private, skip that refresh. The uploaded file is what plays. Do not publish the clip to obtain a stream after the owner chose private.

On the public path, only a final pick gets a real file. Export the WAV from Suno Studio when the account is Premier; Studio exports do not count toward the 60-song monthly download cap. Otherwise call audio-download once for that song, which counts as one download. Never use audio-download for a take that is still under review. When `reviewTakes` is `private`, each review take is already a downloaded file, so do not download it again. Final picks are stored as real files either way.

Before you say takes are playable, run `pnpm takes:verify`. Send the owner its line. That line reports how many stored streams returned 200. A newly published Suno MP4 can return 403 for 1–2 minutes after `publish_pending` is false. `pnpm takes:verify` retries those with backoff for a few minutes. When it waited, the line includes `Retried newly published files that returned 403.` Say they are playable only when every stream returned 200. If any are waiting to be published on Suno, report that count and do not call those takes playable. Do not paste stream URLs or the owner password.

Before sending a listening link, POST `/api/owner/rounds/<id>/ready`. It verifies every planned job is complete and every recorded take has matching provenance and stored audio; report any named blocker it returns. Check actual output counts against the estimate and audio playback. The site is public. Send the site URL with one line: they can listen to every take, vote them up or down, and share it with friends. Compare takes shows the latest round. Do not say a cost estimate is ready unless **What to say about cost** says cost matters. Never print `ALBUM_WRITE_TOKEN`.

Read `listenerVoting` from `pnpm album:settings` before sharing.

- The site is public. Share the site URL. `/` plays the album. Compare takes is `/vote`.
- Listener voting stays off unless the owner turns it on.

As soon as a track's takes are stored, publish or upload them, refresh their streams, and run `pnpm album:progress`. That command checks the live site. If it prints a `Track` line, that track is already on the site. Send the owner that line immediately, including `Site:`. Do not wait for other tracks. When listener voting is on, the link is Listen. Otherwise it is Compare takes. Never print `ALBUM_WRITE_TOKEN`.

Do not say takes are still generating, or that nothing is ready, until `pnpm album:progress` or the Suno job status says so. A `Track` line means that track is ready even when other tracks are not. If the command says progress was unread, open the site and do not invent a status. The count looks like `Round 1: 36/90 done, 72 of 180 takes ready.` Do not go silent until the whole album is done. Every setup and round message includes the site URL. When the round is ready, open Compare takes and confirm it lists takes and names the latest round. If the page says takes are being generated, or takes are waiting to be published on Suno, report that sentence and do not call the round ready.

If listening mode is blind, do not show identifying prompts or model details in chat, filenames, downloads or public routes. If the owner has already seen assignments, say the current round is exposed. Follow `publish` for sheet and log changes when permitted.
