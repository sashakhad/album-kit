# Album Bot execution plan

Use this order to demonstrate the shipped Album Bot. It is not a list of product changes still to make. The November 17 plan described work that has since landed, and its copy is stale. Behavior is defined in the [product requirements](prd.md). Charts are in [decision charts](decision-charts.md). Steps a tester can run are in the [tester walkthrough](tester-walkthrough.md).

Use a disposable album. Say which steps used a real Suno create, a real Cursor model response, or a local fixture. A fixture can show the screens. Only a real response proves that connection. Do not put the album on Sasha’s Vercel or Neon.

## Session order

| Time        | What to do                                                                                                                | What correct looks like                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–15 min    | Open a new bot, then a chat that already has an album, then `/start`. Use `/help` and `/settings` before any create.      | A new bot shows the greeting and one new idea card. A returning chat resumes. `/start` starts a fresh album and leaves the earlier one in place. Help and settings do not connect an account or start a round.                                        |
| 15–40 min   | Choose Album Bot Lite. Send the player when the first clip is streaming, while the rest of the batch renders.             | No Cursor, GitHub, or Vercel card. The first streaming clip is `Open Album.html` in chat, with “Here’s your first take.” The completion card is not shown yet.                                                                                        |
| 40–55 min   | Finish the agreed batch. Show the card only when the batch phase is ready. Leave it unanswered, then send a custom reply. | “Your album is ready. What’s next?” appears once, with Share album, Add more tracks, and free text. A resume does not show it again. A custom reply does not deploy.                                                                                  |
| 55–75 min   | On a separate disposable album, choose Full Setup. Accept, swap, or reduce a lineup of models the project can run.        | The path card uses the five-model sentence. Cursor and the 5–10 minute sign-in note appear only when the comparison is ready to run and a sign-in is needed. The preview counts prompts and takes. A name that did not run is not credited.           |
| 75–100 min  | On Compare takes, review the next pass. If a later create is refused, resume.                                             | The confirmation names the cut. Pass 2 keeps the positive score and drops the negative one. The accepted job is not submitted again. A second album starts at pass 1.                                                                                 |
| 100–120 min | Choose Share album only on the creator’s own Vercel account. Separately choose Add more tracks on the local album.        | Send the link only after the command prints that project’s id and account id. Lite publishes the static player. Full Setup publishes the Next.js app from the pinned kit revision and is checked signed out. New tracks keep the old scores and pass. |

If the session is short, finish the local player, the score, and the pass. Treat a live Cursor lineup and a creator-owned publish as the next checks. Do not describe a sample writer id as a model that ran.

## Where the behavior lives

| Concern                                                 | Read this                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Greeting, commands, Lite, Full, and the completion card | `grokbot/BOT.md` and `.cursor/skills/start-here/SKILL.md`                        |
| ChatGPT and Claude, without a new integration           | `grokbot/PORTABLE.md` and the “Other assistants” note in `AGENTS.md`             |
| First playable take and later arrivals                  | `.cursor/skills/suno-run/SKILL.md` and `node scripts/preview-album.mjs --record` |
| Reopen an existing catalog                              | `node scripts/preview-album.mjs --streams-only`                                  |
| Writer credit                                           | `src/lib/rounds/lineup.ts`                                                       |
| Local pass                                              | `src/lib/votes/local-pass.ts` and `scripts/album-preview.html`                   |
| Publish on the creator’s account                        | `.cursor/skills/publish/SKILL.md`                                                |

## What this pass does not include

Hosted integrations for ChatGPT or Claude, a production rollout, and any use of Sasha’s Vercel or Neon are out of scope. The quick local test in the walkthrough does not spend Suno credits.
