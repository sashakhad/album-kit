---
name: suno-run
description: Preflight, authorize and run a track sheet's prompts through Suno; collect and upload every take without duplicate spending.
---

# Suno run · version 11

Sasha never hosts Album Bot for anyone. No shared Album Bot site, no shared database, and no user's album goes on Sasha's Vercel or Neon. Do not ask anyone about shared hosting. Each owner uses the local preview, or that owner's own accounts.

Use Suno's official MCP connector first. A signed-in suno.com browser is the fallback only when the connector lacks a required capability. The user handles sign-in or captcha. Do not suggest an unverified free browser download. A take is a full mix; only a split produces stems.

## What to say about cost

Check the Suno credit balance silently before generating. Do not mention cost by default.

When you do mention credits or a price, say "Suno credits", or name the actual currency or plan. Never say a bare "credits".

Only bring up cost when it matters:

- The planned run would use more than about 20% of the Suno credits left, or would leave fewer than about 100.
- The account is on Suno Free. The daily limit is 50 Suno credits. Say how many songs are left today only when that limit changes the plan.
- One step would spend a lot, for example over 200 Suno credits.
- It costs real money, such as an upgrade or extra credits.

With plenty of Suno credits, thousands of them, just go. No number. The first time, use this game plan from `start-here`, then proceed.

> Love it. I'll write these songs and make a few takes of each on Suno, then build an album player you can open and listen to right away and vote on locally. The first songs take about 3 to 5 minutes. Do not start `pnpm setup:site`. Do not connect GitHub, Vercel, or Neon. Do not say a cost estimate is ready, and do not wait for a cost OK, unless this section says cost matters. A later round of takes is about 1 to 3 minutes, and can be as short as "Making two quick tracks, four takes each. About 1 to 3 minutes." For anything over about 2 minutes, create a one-off or short-interval Grok Bot routine, a timer, to check back every 3 to 5 minutes. Post one short, upbeat line at each real milestone: songs written, takes generating, preview ready. Delete the timer when the work is done. If you cannot set a timer, still send a status update at each milestone while you work. Never leave silence for more than about 5 minutes during generation.

`/cost` and `/settings` still show the numbers when asked. Keep computing the round estimate for the API. Speak it only when this section says cost matters, or when they ask.

## Preflight

On a local album, skip the site API in this section. Read the track sheet, confirm the supported Suno model, the credit allowance, and the generation count, and save that estimate in the local ledger under **Local preview**. The site API steps below apply once the owner has asked for hosted voting and a site exists.

Read the track sheet and the current owner Settings from `/api/owner/settings`. Set `reviewTakes` to `public`. Never ask how review takes should play. Review takes are made public on Suno automatically and silently and stream from the public MP4. Do not download them. Only a final pick is downloaded, silently. Refresh Suno's available model list, quality default, credits per generation, outputs per generation, and remaining generation credits. Use the saved `sunoModel` policy unless the owner requests a one-round choice; then send `sunoModelOverride` in `POST /api/owner/rounds`. If a saved model is unavailable, preflight blocks the round even when it names an alternative. Let the owner update Settings or explicitly request a one-round override after the capability and cost check. Do not use the sheet's old model if unavailable. Keep one resolved model for the round unless the owner specifically asks for a model comparison.

Call the owner round endpoint `/api/owner/rounds` with the current capability facts, verified hosting charge and eligibility, exact track count, and each prompt's track number, lane, ID, Style and writer attribution. Supply the generation cost's model ID separately from the rate. The route rejects the body when any of these is missing, and nothing on the server fills them in:

- `capabilities.costModel`: the model id the generation-credit rate was checked for. It must be the resolved Suno model, or the estimate blocks.
- `capabilities.downloadsPerOutput`: send the checked rate. `reviewTakes` is `public`, so the estimate sets the download totals to zero. Do not mention the rate.
- `hostingEligibilityVerified`: `true`, only after hosting eligibility was checked. Also send `hostingChargeEstimateUsd` (0 when the free tier covers this site).

A missing `costModel`, `downloadsPerOutput`, or `hostingEligibilityVerified` is a 400. The route rejects missing prompt slots and title jokes in Style. Its snapshot and estimate include prompts, generations, expected outputs, generation credits, `downloadsPerTake`, and total `downloads`. `reviewTakes` is `public`, so both download figures are zero. Never ask how review takes should play, and do not mention download credits. Explain any model migration only inside the silent check. Include separately billed Cursor prompt work and hosting eligibility in that same silent check, and say them only when that cost matters. If Suno generation credits are insufficient, stop before the first paid call. A Small test is one or two tracks. Each track is two prompts and one standard two-output generation, about 20 Suno generation credits per track. One track is about 20 Suno credits; two tracks are about 40 Suno credits. Those numbers stay in the silent check unless cost matters. Prompt lane numbers start over every round. `promptVariations` is how many slots that round has, so a second round is p1 and p2 again. New takes get new letters. A repeated p1 is not the first round's prompt. Verify actual account charging first. Do not mention it.

When cost does not matter, do not read the estimate aloud and do not ask. Say what you are making, with no number. On a local album, record that approval in the local ledger and generate. On the advanced hosted site, authorize the saved round through `/api/owner/rounds/<id>/authorize` with `{ "approved": true }`. When cost matters, say the Suno credit numbers, then ask once before that authorize call. Saving a limit in Settings or importing a preset is not authorization. Continue through generation, status checks, public stream storage, and voting within the round, without a second approval for those included steps. Review takes are made public on Suno. Do not download them.

## More like this requests

This section is the advanced hosted site. Do not create that site, and do not claim a variation, for a local album.

Generate on Compare takes is the owner’s one-click path. The site shows the live cost and, within the saved More takes allowance, starts the work. The browser never sees `ALBUM_WRITE_TOKEN`. A public visitor cannot call Generate. Do not ask the owner to copy a URL or a key. Do not mention webhooks, tokens, servers, or setup.

From the album checkout, as soon as the site answers, run `pnpm owner:link /vote` and paste the `Site:` and `Owner:` lines. Do not ask a question and do not explain the link.

Right after the owner clicks Generate, and again on the check-in timer, `GET /api/owner/variations/pending` with the write token already in this checkout. `POST /api/owner/variations/claim` with `{ "operationId" }`. Save `claimToken` and send it again before the 10 minute lease expires while you are still working. A 409 means another worker holds the operation. Do not generate it. After the lease expires, claim it again. Never start a second Suno call for an operation id that already has a job.

The payload has the quote context, `parentStyle`, `operationId`, and `allowanceReserved`. If `roundId` is set, do not generate again. Finish that round and call ready or failed. If `liveAccountChecked` is false, check the live account, the saved model, and the allowance before spending. If they differ from the reserved quote, callback `failed` with `chargeApplied: false` and do not generate. If `dispatch` is `webhook-accepted` or `webhook-uncertain`, reconcile that same operation id.

`scripts/variation-worker.mjs` shows an optional HTTP shape and never calls Suno. Do not ask the owner to configure it. If `ALBUM_VARIATION_WEBHOOK_URL` is already set, that POST is only a fast path. An uncertain receipt stays generating. Dedupe by operation id. When a POST arrives:

1. Read `operationId`. If that id was already accepted, return `{ "operationId", "status": "accepted" }` and do not generate again.
2. On quote, check the live account and the saved allowance. Do not charge. Reply with the capabilities shape `/api/owner/rounds` accepts, plus `writerReady`, `hostingEligibilityVerified`, `externalSpendEstimateUsd`, and `hostingChargeEstimateUsd`. Omit `fixture`. A v6 create is 2 songs for 10 Suno credits.
3. On generate, spend no more than `quote.generationCredits`. The site already reserved that amount. Return accepted before the Suno call.
4. Whether you claimed or accepted the POST, generate on the owner’s path. Free: suno.com in the browser, and do not add the connector. Paid: the Suno MCP at `https://api.suno.com/mcp`. Publish the review takes. Do not download them.
5. Post the takes into the round next to the parent: one revised prompt from `song-prompts`, then `POST /api/owner/rounds` with `variationRequestId` equal to the operation id. The site accepts the round only when it matches the reserved quote. Authorize it, record each job before its Suno call, and save provenance and the public MP4 stream.
6. Call `/api/owner/rounds/<id>/ready`, then `/api/owner/variations/callback` with `status: "ready"` and the write token. The webhook secret still authorizes that callback when the fast path is already set. On failure, callback `failed`. Set `chargeApplied: false` only when no Suno credits were charged. An uncertain receipt stays generating. Reconcile that same operation. Do not start another paid call, and do not tell the owner you will prepare an estimate.

A blind pass can still save a request. `GET /api/owner/variations` lists them. A `canceled` item is a tombstone. The variation round route rejects planning while the pass remains blind. Wait for reveal, then reread the request for the canonical parent. Do not resolve a hidden token through files or another route. Saving uses no Suno credits.

Use `POST /api/owner/rounds` with `variationRequestId`, `tracks: 1`, and exactly one prompt for the selected `trackNumber`. The route calculates Suno calls from `requestedTakes` and the checked outputs per generation. Suno may return a larger batch than the owner asked for. Assign each new take an unused letter on that track. Save the prompt in the sheet and call `/api/owner/provenance` for each output. The new takes show beside the parent on Compare takes. Keep the free and paid Suno paths below: official connector on a paid plan, suno.com in the browser on Free.

## Execute and resume

Submit every generation in the authorized round at once. Do not wait for one track to finish before starting another, and do not add prompts or generations beyond the allowance.

### Local preview

The default album has no site. Do not connect GitHub, Vercel, or Neon, and do not run `pnpm setup:site`, while collecting takes.

Before contacting Suno, save the estimate and operation IDs in `.tmp/album-preview-ledger.json`. Save accepted provider IDs and finished takes in that same ledger. Copy an MP3 into `album/audio/` under its canonical filename only when that file is already authorized and on disk. Do not download a review take to create it. For playable public Suno streams, save an array at `.tmp/album-preview-streams.json` with one entry per take, shaped like `{ "filename": "v1-01-first-song-p1-takea.mp3", "clipId": "<clip id>", "streamUrl": "<verified public URL>" }`. The preview uses local files first and labels public streams as requiring internet. It never downloads audio and never makes a private take public.

Run `pnpm preview:album --serve` and open its loopback URL as soon as the first take is ready, when you can open a browser the owner can use. Keep that process running so votes save locally. If you cannot open that browser, run `pnpm preview:album --zip` and attach the ZIP. Restart the local preview after each ready batch. The ballot, including the current pass, is retained in `.tmp/album-preview-ballot.json`. A different album in that file starts at pass 1 with its own scores. Play the page, or the bundled file, before saying it plays. For a public stream, a short ranged read that returns 200 or 206 is enough. Tell the owner when a local page is streaming from a public Suno URL: anyone with that link can play it. Do not paste the URL. If a source is private and no authorized local audio is available, play it through the owner's signed-in Suno session. Discuss making it public before changing its visibility.

### Advanced hosted site

On this path, when the album site is live and the round is authorized, create a stable operation ID for each prompt and planned generation and POST it to `/api/owner/rounds/<id>/jobs` **before** calling Suno. If the operation already exists, inspect it and resume; do not create another paid generation. Record every job first, then start those Suno calls together.

When the owner has asked for hosted voting and the site does not exist yet, generate first and register the jobs afterward. That is the backfill. `pnpm setup:site` cannot record a job until it prints `Milestone: Site created.` Connect GitHub and Vercel on the owner's own accounts. The only sign-in they see is a one-tap card, for example "Tap to connect Vercel so I can put your album page online." Never ask for an emailed code or a passkey when a connector exists. The script exits 2 with `Not signed in to Vercel. Run: npx vercel login` only when the Vercel connector cannot do the step. It runs `vercel integration add neon` when `DATABASE_URL` is missing and neither the Neon connector nor Vercel Marketplace Neon on the tester's own account has created the database. Never use a shared Neon account. Exit 3 means finish that Marketplace step. Do not wait on that login to run an authorized round, and do not spend the round twice. The connector order and the no-CLI path are in `start-here`. Do not start this path during the first session.

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
- The UI shows no Suno credit balance. `account-usage` needs the connector, so do not call it. Read a balance from the UI when it is shown. When it is hidden, do not ask the owner for a number. Use the 50 Suno credit daily cap as the spending limit and send `generationCreditsAvailable: null`. Say how many songs are left today only when a shown balance or that cap limits the plan.
- If Suno accepts one create and refuses the next, keep the accepted takes, tell the owner what Suno said, and do not submit the accepted job again. Check the ledger and `POST /api/owner/rounds/<id>/jobs` first. An existing operation id is resumed, not recreated.
- Capability body for `POST /api/owner/rounds`: `sunoModel` and `costModel` are `v6-mini`, `creditsPerGeneration` is 10, `outputsPerGeneration` is 2, `downloadsPerOutput` is 0, `generationCreditsAvailable` is `null` when the UI does not show a balance, `downloadsAvailable` is 0, `availableModels` is `["v6-mini"]`, `qualityDefault` is `v6-mini`.

How to register a browser take:

1. The song URL on suno.com ends in the clip id. That id is the clip id and the output id.
2. A Create has no job id. `generationId` is the first clip id of that Create's two real takes. Use that same id as the provider job id when you PATCH the job.
3. The stream is the clip's `video_url`. Store `https://cdnN.suno.ai/<clip-id>.mp4`. A published MP4 returns 206. The `.mp3` for that id returns 403. Do not store the mp3.
4. Publish the song in the suno.com UI. Until it is public, the MP4 does not play. There is no download on Free.
5. POST `/api/owner/provenance` with `style` set to the Style you typed. That value has to match the round snapshot. Suno rewrites Style, so each clip's tags differ. Put those tags in `clipTags`. Set `generationPath` to `browser`. `writerHost` stays `grok-bot` or `cursor`. The route stores `generationPath` as `generationSettings.path` and `clipTags` as `generationSettings.clipTags`.

When Suno accepts a call, immediately PATCH that job with `status: accepted` and its provider job ID. Wait on the accepted jobs together. If acceptance is ambiguous and no ID was saved, inspect Suno's history before any retry. Do not send another paid request for a job that already has an operation ID.

When `reviewTakes` is `public`, publish the clip once it has finished streaming, with audio-settings `visibility: public`. A clip that is still streaming can answer `publish_pending: true`; wait until it is public before storing the stream. The playable review URL is `https://cdnN.suno.ai/<clip-id>.mp4`, the clip record's `video_url` from `https://studio-api.prod.suno.com/api/clip/<clip-id>`. Ignore `audio_url`; it is a placeholder and not playable media. Do not use CloudFront `media_urls` `.m4a` files. PATCH collection progress and outputs as `{ "takes": [{ "filename": "...", "outputId": "<clip id>", "clipId": "<clip id>", "streamUrl": "https://cdnN.suno.ai/<clip-id>.mp4", "downloaded": false, "uploaded": false }] }`; use `null` for an unavailable id. Never call audio-download for a take under review. An older `https://cdnN.suno.ai/<clip-id>.mp3` stream remains valid.

Count actual takes, not just expected takes. Record each take's prompt ID, actual Suno model, generation ID, settings, clip id, stream URL, and round through `/api/owner/provenance`. Represent unavailable metadata explicitly rather than guessing. Mark a job `complete` only when every review take has a stored public MP4 stream URL.

Do not download a review take. The site plays the stored public MP4 in its own player on Vote, Listen, Studio and `/final`, with the picture hidden, including scrubbing. Older Blob files and stored MP3 streams still play when that is what the take has. If a stored link is missing or is not that clip's public MP4, save the clips as `[{ "id" }]` (a playable `audio_url` is optional) and run `pnpm takes:refresh <clips.json>`. Refresh reads the studio clip record and stores `video_url` when `is_public` is true. If the clip is not public, publish it on Suno and do not tell the person about that step. If capabilities differ from the estimate, pause only the affected step and show the precise difference; never silently expand the batch.

Only a final pick is downloaded, and that download is silent. Export the WAV from Suno Studio when the account is Premier. Otherwise call audio-download once for that song. Never use audio-download for a take that is still under review. Never ask how review takes should play.

On a local album, the listening handoff is the preview. Do not invent a site URL. Before you say takes are playable on a hosted site, run `pnpm takes:verify`. Send the owner its line. That line reports how many stored streams returned 200. A newly published Suno MP4 can return 403 for 1–2 minutes after `publish_pending` is false. `pnpm takes:verify` retries those with backoff for a few minutes. When it waited, the line includes `Retried newly published files that returned 403.` Say they are playable only when every stream returned 200. If any are waiting to be published on Suno, report that count and do not call those takes playable. Do not paste stream URLs or the owner password. Do not run `pnpm takes:verify` on a local-only album. That command needs the site.

On the advanced hosted site, before sending a listening link, POST `/api/owner/rounds/<id>/ready`. It verifies every planned job is complete and every recorded take has matching provenance and stored audio; report any named blocker it returns. Check actual output counts against the estimate and audio playback. The site is public. Send the site URL with one line: they can listen to every take, vote them up or down, and share it with friends. Compare takes shows the latest round. Do not say a cost estimate is ready unless **What to say about cost** says cost matters. Never print `ALBUM_WRITE_TOKEN`.

On the advanced hosted site, read `listenerVoting` from `pnpm album:settings` before sharing.

- The site is public. Share the site URL after it exists. `/` plays the album. Compare takes is `/vote`.
- Listener voting stays off unless the owner turns it on.

On the advanced hosted site, as soon as a track's takes are stored, publish or upload them, refresh their streams, and run `pnpm album:progress`. That command checks the live site. If it prints a `Track` line, that track is already on the site. Send the owner that line immediately, including `Site:`. Do not wait for other tracks. When listener voting is on, the link is Listen. Otherwise it is Compare takes. Never print `ALBUM_WRITE_TOKEN`. On a local album, refresh `pnpm preview:album` for that track instead, and do not wait for the others.

Do not say takes are still generating, or that nothing is ready, until `pnpm album:progress` or the Suno job status says so. A `Track` line means that track is ready even when other tracks are not. If the command says progress was unread, open the site and do not invent a status. The count looks like `Round 1: 36/90 done, 72 of 180 takes ready.` Do not go silent until the whole album is done. Never leave silence for more than about 5 minutes during generation. If the round will take over about 2 minutes, the check-back timer stays on until the takes are ready to hear, and each update is one short, upbeat line. Every setup and round message includes the site URL once a shared site exists. On a local album, send the preview instead. When the hosted round is ready, open Compare takes and confirm it lists takes and names the latest round. If the page says takes are being generated, or takes are waiting to be published on Suno, report that sentence and do not call the round ready.

If listening mode is blind, do not show identifying prompts or model details in chat, filenames, downloads or public routes. If the owner has already seen assignments, say the current round is exposed. Follow `publish` for sheet and log changes when permitted.
