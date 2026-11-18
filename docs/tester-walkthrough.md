# Album Bot tester walkthrough

Two checks. The first runs in the kit and needs no Grok Bot, Suno spend, Vercel, or Neon. The second is a live chat on the creator’s own accounts. Screens and decisions are specified in the [product requirements](prd.md), the [execution plan](execution-plan.md), and the [decision charts](decision-charts.md).

## Quick repeatable test

From the kit root, with Node 24:

```sh
pnpm exec vitest run src/lib/__tests__/product-handoff.test.ts
```

The test builds a disposable album outside the checkout. It records one fixture take, then a second take of the same track, using `node scripts/preview-album.mjs --record`. Nothing is uploaded and nothing is deployed.

### Expected screen

`Open Album.html` is the file named by `link`.

| On the page      | After the first take                   | After the second take             |
| ---------------- | -------------------------------------- | --------------------------------- |
| File             | `Open Album.html`, the Listen page     | The same filename                 |
| Album data       | Title Paper Lantern, one track, Take A | The same track, Take A and Take B |
| Take A’s id      | The id stored for that filename        | The same id                       |
| Copy in the data | The album is in the making             | Unchanged                         |
| Hosting          | No site setup and no deploy            | Still none                        |

The command checks the file that would be attached. It does not click the page. Open that file in a browser to see the album title, **Listen**, **Play**, and take **A**. Tap the track and it plays. The Listen page does not show the pass control. Score and **Next pass** belong to the served player (`node scripts/preview-album.mjs --serve`) and to Compare takes. The page does not add a notice about how the audio is hosted.

A failure in this test is a player regression. It does not prove that Grok Bot said the greeting or that Suno accepted a create.

## Real-service test

Run this in a Grok Bot chat that loads the kit playbook. Use a disposable album and the creator’s own Suno account. If you publish, use the creator’s own Vercel project. Do not use Sasha’s Vercel or Neon. This VM cannot open that chat, so these steps are the live check.

Record the UTC time of the first playable attachment, how many times a person had to tap or sign in, and whether each step was a real service or a fixture. Do not report a model as having written a prompt unless that session stored its provider, observed model, and execution id.

1. Start a new Album Bot chat. Do not type `/start`. Expect only “Hey, I'm Album Bot! Type /help for commands or /settings to see your setup. Let's get some music going.” Then one card: “What kind of album do you want to make? Describe it in your own words, or tap an idea.” Expect three ideas invented for this chat and **Surprise me** last. Expect no account card.
2. Type `/help`. Expect a plain description, the next step, and the command list, including `/setup`, `/share`, `/refresh`, and `/upgrade`. Expect no Suno create.
3. Type `/settings`. Expect Lite or Full still open, the defaults, and no connection and no round.
4. Type an album idea. Expect “How do you want to start?” with Album Bot Lite and Full Setup. Lite’s line is “Play and score a few tracks on this computer. I’ll use Suno’s lighter model when available. Works with Suno Free.” Full Setup’s line is “Up to five different AI models each write a prompt for the same song. Compare the takes blind and hear a version that combines their ideas.” Expect no Cursor, GitHub, or Vercel card on this step.
5. Choose Album Bot Lite. If this chat has no working Suno session, expect one card, “Do you already have a Suno account?” with **Yes** and **Not yet**. Expect that card after the path, not on the greeting. A working session skips the card and the method menu.
6. No-account persona: reply **Not yet**. Expect exactly “Since you don't have a Suno account, this takes a few minutes to set up.” Then expect “Phone is the fastest. Suno texts you a code and you're in.” and the other methods still offered: email, Google, Apple, Microsoft, Discord, and Facebook. Expect no email-and-password form. When Suno asks for a birth date, expect the bot to fill January 1, 1995 without asking, then say exactly “I just picked Jan 1, 1995 for the birthday so sign-up keeps moving; you can change it later in Suno settings.” Enter the text code on Suno’s page, not in chat. Expect names and the brief to continue while that code is pending, and no Create before the session can create.
7. Can’t-log-in persona, in a separate chat with no working session: reply **Yes**, then say you cannot log in. Expect the same phone sentence before any failed password, with the same other methods. Expect a birth date to be filled only if that sign-in page requires one, with the same date and the same sentence.
8. Existing-account path: use the standing Suno account that is already signed in. Expect no account card and no method menu. Answer the album title and the track titles, or accept the offered ones. Expect about two or three tracks unless you asked for another number. Expect exactly “I’ll write the songs and send you a player as soon as the first take is playable. You can listen while Suno makes the rest.” Expect no second sentence about when the player arrives, and no take count or track names in that message.
9. Before the first Create, confirm `scripts/preview-album.mjs` and `scripts/player-shell.html` are already on disk, in the checkout or under `.album-kit/<sha>/`. When the first clip is only `streaming`, expect no player yet. When `node scripts/probe-stream.mjs <streamUrl>` prints `"ok": true` (HTTP 200 or 206, `video/mp4` or `audio/`), and other named tracks do not have a take yet, expect exactly “Here’s your first take. I’ll make the next tracks on the album. /more makes more takes of this song, and /pick chooses favorites.” and an `Open Album.html` attachment in that chat while the other clip ids are still polling. Expect no extra sentence, and no close that only offers more takes or picking favorites. The remaining named tracks start without a reply. It is the Listen page: the album title, Listen, Play, and take A. Tap the track and it plays. Expect no hosting setup and no install or build between that probe and the attachment. Note the time from the passing probe to the attachment. The target is under ten seconds.
10. Leave the chat alone until every take you requested can play. Then expect, once, “Your album is ready. What’s next?” with **Share album**, **Add more tracks**, and a free-text **Something else**. Do not answer yet, and confirm the card is not asked a second time for this batch. To score before sharing, run the served player on the album computer and add one to the first take. That score stays in `.tmp/album-preview-ballot.json`.
11. Reply “leave it on this computer.” Expect no deploy and no second card for this batch.
12. Send “still listening.” Expect no second completion card and no replay of the greeting. A later message in this chat resumes the album already in progress.
13. Type `/start`. Expect the greeting and a new idea card. The first album’s files, score, and pass remain. Asking to listen to that first album still shows them.
14. If the Suno account hides its balance, confirm the bot does not ask you for a credit count and still attempts the batch you agreed to. If a later create is refused, the accepted take stays in the player and a resume does not submit that same job again. If the account shows a balance, write that this case was not exercised. Do not invent a hidden balance.
15. In a separate disposable album, choose Full Setup. Expect the 5–10 minute sign-in note only if a connection is actually required, and only after the brief and track names. Expect a named lineup of models this Cursor project can run, and the choice to keep, swap, or shrink it. Choose two. With two recordings per Create, the preview is three prompts and six takes for that track. After reveal, each take shows its own prompt and writer. Combined credits only writers that ran. A name you requested that did not return a prompt is absent.
16. Choose **Add more tracks** on the local Lite album. The batch command appends the new songs. Expect them beside the old ones, the old scores and pass unchanged, the first new take in the same player, and the completion card once when that new batch is `ready`.
17. Choose **Share album** only if you can publish to your own Vercel project. Send the link only after the command prints that project’s id and account id. Lite should open the static player and play a take with no sign-in. Full Setup should open `/listen` and `/vote` signed out, play a generated take, and keep a second browser’s ballot separate after reload. If you cannot use your own project, stop. Leave the local player. Do not borrow another account.
18. On Compare takes, score one take down and one take up, then press **Review next pass**. Expect the confirmation to name the cut, then **Confirm pass 2**. The negative take is dropped and the positive score stays. Reload and confirm. A different album title starts at pass 1 with no votes. `/listen` rebuilds the Listen file and does not drop that vote.

ChatGPT or Claude may be tried from `grokbot/PORTABLE.md` with whatever tools that session has. That trial is optional. Do not treat it as a supported integration, and do not credit a model that session did not run.
