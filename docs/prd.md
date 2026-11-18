# Album Bot product requirements

Current behavior of Album Bot Lite and Full Setup. This replaces the November 17 review drafts. Those drafts use a retired spelling of Lite, warn the listener about how the audio is hosted, and ask whether to share before the album is finished.

Related: [execution plan](execution-plan.md) · [decision charts](decision-charts.md) · [tester walkthrough](tester-walkthrough.md) · [portable handoff](../grokbot/PORTABLE.md) · [playbook](../grokbot/BOT.md)

## Outcome

A person with an album idea gets two ways to start, after the idea and before any account connection. **Album Bot Lite** plays and scores a few tracks on their computer, including with Suno Free. **Full Setup** has up to five models write one prompt each for the same song, plus a combined prompt, and the creator compares the takes blind.

Both paths send a local player as soon as the first take can play. Hosting stays disconnected until the creator chooses **Share album**. Sasha never hosts Album Bot for anyone. No album is placed on Sasha’s Vercel or Neon. Each creator uses the local preview, or that creator’s own accounts.

## New bot, returning bot, and commands

A new bot presumes start. A brand-new conversation starts onboarding by itself. The owner does not type `/start` for that first album. An active conversation resumes the current album and does not replay the opening. Explicit `/start` starts a fresh album and preserves the existing album, takes, scores, and jobs. `/new` does the same, in a separate album folder. Remove an earlier album only when the owner asks.

The first text line of a fresh album is only:

> Hey, I'm Album Bot! Type /help for commands or /settings to see your setup. Let's get some music going.

Then one question card, with free typing, and not repeated in the text line:

> What kind of album do you want to make? Describe it in your own words, or tap an idea.

The card offers three album ideas invented for this conversation, then **Surprise me**. Each idea is a short theme, sound, and mood. The three differ in style and era. None is only a genre name, and none is copied from a saved list. A typed description is the concept. The question is not asked again.

`/help` and `/settings` work before sign-in. `/help` says what Album Bot does, the next step for this album, and the command list, including `/setup`, `/share`, `/refresh`, and `/upgrade`. It does not connect an account or start a round.

`/settings` shows the current setup: Lite or Full, Suno plan and model, prompt writers, comparison mode, takes per track, spending limits, and sharing. It includes the credit balance when the account exposes one. Before setup, it shows the defaults and which choices are still open. It answers from available settings and does not require a connection or start a round.

`/refresh <branch-or-SHA>` then `/refresh main` switches this chat’s instructions only. Report the revision that loaded. Preserve jobs, scores, and votes. Do not create a duplicate job. Do not drop a vote. `/listen` rebuilds the player from the existing takes and scores. Do not create a job or drop a vote. `/surprise` invents a concept, then names, then a small test.

## The path card

After the idea, and before any connector or website, one card asks “How do you want to start?” Skip it when the creator already chose.

| Choice         | Exact copy                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Album Bot Lite | Play and score a few tracks on this computer. I’ll use Suno’s lighter model when available. Works with Suno Free.                           |
| Full Setup     | Up to five different AI models each write a prompt for the same song. Compare the takes blind and hear a version that combines their ideas. |

The Full Setup card does not mention Cursor, a website, or a sign-in time. Selecting it records the choice and continues the creative questions. Cursor is connected only after the brief and track names are settled and the comparison is about to start. If a sign-in is actually needed then, say that Cursor runs the models and paid Suno makes the music, and allow about 5–10 minutes.

## Suno account

After the path, and not on the greeting, ask once “Do you already have a Suno account?” with **Yes** and **Not yet**. A working session skips this question and the sign-in menu, so the first take is not delayed. Skip it when they already said whether they have an account.

If they do not have an account, say exactly “Since you don't have a Suno account, this takes a few minutes to set up.” Then walk them through Suno’s own sign-up page. Recommend phone first: “Phone is the fastest. Suno texts you a code and you're in.” Also offer email, Google, Apple, Microsoft, Discord, and Facebook. The code is entered on Suno’s page, never in chat.

When the form requires a birth date, fill January 1, 1995 without asking. Then say exactly “I just picked Jan 1, 1995 for the birthday so sign-up keeps moving; you can change it later in Suno settings.” Do not ask them for a birthday.

If they have an account but are not signed in, or they cannot log in, use the same phone sentence. Do not wait for a failed password. Fill a birth date only if that page requires one, with the same date and the same sentence.

Keep going on names and the brief while they finish the code. Do not start a Create before the session can create.

Names come next, one at a time, skipping anything already answered. The album-title card asks “What do you want to call this album?” with two or three invented titles and free typing. The track card shows a numbered list, then “What should the tracks be called?” with **Keep these**, **I'll name them myself**, and **Let Album Bot decide**. Those exact strings are written to `album/album.json` before a preview, a share, or a Suno create.

## Album Bot Lite

During Lite, do not connect Cursor, GitHub, or Vercel, and do not run `pnpm setup:site`. Record `node scripts/onboarding.mjs path light`. Grok Bot writes the prompts. Its label is **Grok Bot · model undisclosed**.

Use the signed-in suno.com browser on Suno Free, and do not add the Suno connector. On Free or paid Suno, honor an explicit model choice, then a saved preference. Otherwise prefer `v6-mini` when that account lists it. If Mini is unavailable, use another verified eligible model within the approved cost. Full Setup keeps the account’s normal quality default.

Start with two or three tracks unless the creator asked for another number. A requested small test is one or two tracks, two prompts each. When the titles are confirmed, run `node scripts/preview-album.mjs --open` and send that page before any Create. Submit the agreed Creates only after the publish-quota check, and update that same page when the first public CDN stream exists. Do not wait for the other takes. When the first Create is submitted, run `node scripts/live-progress.mjs start` and send its `say` before the next tool call. Copy this sentence exactly. Do not add a second sentence, and do not name the take count or the tracks in that message.

> The first take usually starts playing in about 20–30 seconds.

That line is the measured time. Suno does not supply this estimate. Do not wait for one. If about 45 seconds pass with nothing new, run `node scripts/live-progress.mjs waiting` and send its `say`.

When the account hides the credit balance, do not ask how many Suno credits are left. Send `generationCreditsAvailable: null`. Try only the batch they agreed to, inside the spending limit. On Free the daily cap is 50 Suno credits. If Suno accepts one create and refuses the next, play the accepted takes and say Suno says you're out of credits. Save the accepted job and never submit that job again.

## Full Setup

Record `node scripts/onboarding.mjs path full`. Finish the brief and track names before connecting Cursor. Suggest up to five distinct models that this Cursor project can run, name them, and ask “Use these five, swap a model, or pick a smaller lineup?” One model, or any two to five, is allowed. If fewer can run, show only those. If a chosen writer is unavailable, offer a replacement before generating. A requested name that did not return a prompt gets no credit. `cursor --version` is not a connection.

Keep one original prompt from each selected writer and one Combined prompt. Use the same brief, lyrics, Suno model, and batch for every entry. Before audio, say how many prompts go to Suno, how many takes come back, and the Suno credit cost when cost matters. Five writers plus Combined, one Create each, two recordings per Create, is six prompts and twelve takes for that track. Two writers plus Combined with that provider is three prompts and six takes. The creator can choose fewer entries or the curated suite.

Save `comparison: "originals-plus-combined"` and `writerLineup`. A Cursor round is allowed only after each selected model returns a prompt with a provider, an observed model, and an execution id. Listening is blind. Reveal shows each take’s exact prompt, the writer that ran, and the score. Combined is its own result and credits only writers whose ideas it used and who actually ran.

The historical _Photosynthesupersizeme_ notes show how that album’s writers and combined prompts were chosen. They are not the lineup for a new album. Today’s lineup is whatever this Cursor project can run, and only a verified run is credited. [Historical notes](https://github.com/sashakhad/album-kit/blob/main/examples/mus1c-for-v3gans/PHOTOSYNTHESUPERSIZEME-SYNTHESIS.md)

## First playable take, then the finished batch

A status of `streaming` is the public CDN handoff. The public MP4 usually plays about 20–30 seconds after accept. Do not wait for `complete`. When `audio-create` returns clip ids, act on the first clip id and keep polling the others in the background. Do not call `audio-wait` with every id. Publish the clip, then store `https://cdnN.suno.ai/<clip-id>.mp4`. A later probe can confirm 200 or 206 with `video/mp4`. The handoff does not wait for it. A 403 leaves only that clip pending. Send the page when the titles are confirmed, with placeholders, before any Suno Create. The installed instructions save the files in `scripts/exporter-files.mjs`, including `scripts/preview-album.mjs` and `scripts/player-shell.html`, before any Suno Create.

When one clip passes this probe, write `{ "filename", "clipId", "streamUrl" }` and run `node scripts/preview-album.mjs --record <ready-take.json>` with Node 24. Attach `Open Album.html` from the printed `link` in the same chat, while the other clip ids keep polling. Aim for under ten seconds from the first playable take. Do not run pnpm, an install, or a build between that URL and the attachment. The command prints `say`, `preview` (`Album page.png`), and `shareCard: false`. The first line is “Your album page is ready. Tap to listen ↓”. On the first page it also includes “Cool, the first ones are in. Spinning up your album page now. Tap here to listen.” If `preview` is set, it is a screenshot of that page. Attach it, then the file. If `preview` is missing, send the file with no picture. Do not draw a stand-in. When other tracks on the album list do not have a take yet, `say` includes “I’ll make the next tracks on the album. /more makes more takes of this song, and /pick chooses favorites.” Do not wait for a reply before starting those tracks. Making the next tracks is the default. Use the remaining titles already on the list. Do not append titles that are already on the list. /more and /pick are secondary and do not append songs. A later page names what is new, such as “Track 1, takes A and B are in.”, and keeps that next-track clause while tracks are unfinished. When every requested take is playable, send the page first. The share card is a later message. If the creator asked only for the tracks that are already playing, do not promise more tracks. Songs may be submitted as each sheet is ready, so the first playable song can be any track in the batch. `node scripts/preview-album.mjs --streams-only` reopens takes already recorded.

The completion card waits until every requested take in the batch is playable, and until the owner’s next message after the page. Run `node scripts/live-progress.mjs heard`, then `node scripts/album-batch.mjs status`, and show the card only when the phase is `ready` and `shareCard` is true. Do not show it with the file. A pending or failed take keeps the batch open unless the creator agrees to finish with fewer. Ask once per completed batch:

> Your album is ready. What’s next?

The card’s choices, in order, are **Share album** and **Add more tracks**. Free typing is **Something else**. Silence, or “later,” leaves the player open. A bare “yes” needs one short clarification. On resume, phase `offered` or `recorded` skips the card. The same card returns once when a later batch of new tracks is `ready`.

| Reply                                | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Share album, or `/share`             | Publish on the creator’s own Vercel account. The share command prints `projectId`, `accountId` and `url`. Send the link only when that account is the creator’s confirmed project. A URL alone does not identify the deployment. Lite publishes the static HTML player and checks that it opens and a take plays. Full Setup builds the Next.js app from the selected `sashakhad/album-kit` revision (`--ref <verified-kit-SHA>`, default `main`) with this album’s songs, settings, jobs, and takes. Check `/listen` and `<site>/vote` signed out, play a take, and check `/settings` in the creator’s session before sending the URL. If deployment fails, keep the local player and say what is needed. |
| Add more tracks                      | New songs on this same album. Append them with `node scripts/album-batch.mjs reply --choice add`. Keep earlier tracks, takes, scores, the current pass, and pending jobs. Deliver the first new take in the same player immediately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Something else, “later,” or no reply | Keep listening. Do not deploy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/more`                              | Alternate takes of an existing track. This is not Add more tracks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Connections and fallback

| Situation                                    | Behavior                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Instructions cannot be fetched               | Use the last complete cached playbook, or the bundled copy. Do not label that copy with a SHA that failed to load.         |
| Suno Free                                    | The official connector refuses the account. Use the signed-in suno.com browser. Prefer `v6-mini` when listed.              |
| Balance hidden                               | Do not ask for a number. Continue the agreed batch inside the limit.                                                       |
| A later create is refused                    | Keep and play the accepted takes. Report what Suno said. Resume by the saved job, and do not submit it again.              |
| Chosen writer cannot run                     | Offer a replacement before generating. Do not credit the missing name. The creator may switch to Lite.                     |
| The host cannot keep posting after this turn | Send what is ready, save the outstanding job ids, and say the creator can resume here. Do not promise an automatic return. |
| Playback fails                               | Say what failed and the next step. The Listen player says “Could not play this track. Try again.”                          |
| Share or the full app fails                  | The local player stays available. Resume the same project after the blocker is fixed.                                      |

GitHub is optional and only for a backup the creator requests. A Lite creator who explicitly asks to collect ballots across browsers can use the full site on their own accounts.

## Voting passes and recovery

`Open Album.html` is the Listen page. The header shows the album title and **Listen**. The page names the album, says it is in the making, and offers **Play**. Under **Tracks**, each ready take is a letter button such as **A**. Tap a track and it plays. The album moves on by itself. That page does not show the pass control.

Score and advance a pass on the served player, `node scripts/preview-album.mjs --serve`. It stores the ballot in `.tmp/album-preview-ballot.json`. Starting the next pass drops negative scores. Positive scores carry forward. Zero and unscored takes stay. The pass number increases by one. A different album has its own pass and scores, starting at pass 1. `/listen` rebuilds the same file from the existing takes and scores and does not drop a vote.

On a shared Full Setup site, `<site>/vote` opens Compare takes with no sign-in. Each browser has its own ballot, separate from the owner’s scores. Reload keeps them. The owner presses **Review next pass**. The confirmation names the count and the cut, such as “Start Pass 2? No takes will be cut.” or “Start Pass 2? 1 take will be cut. 1 take will stay.” The button is **Confirm pass 2**. Listener ratings on a shared static player stay in that listener’s browser.

An accepted Suno job is saved before any retry. Checking status or resuming reads that job. It does not create another paid generation for the same operation.

## Other assistants

Grok Bot with Cursor is the supported path. ChatGPT and Claude can try the same instructions with the tools their own session provides. The handoff is [grokbot/PORTABLE.md](../grokbot/PORTABLE.md), linked from [AGENTS.md](../AGENTS.md) and the [README](../README.md). Credit only a model that returned the prompt in that session. Building integrations for those hosts is outside this product pass.
