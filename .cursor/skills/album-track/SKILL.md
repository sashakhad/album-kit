---
name: album-track
description: Write or revise the requested number of Suno Style prompts for a track and ship its sheet.
---

# Album track · version 4

Use `song-prompts` for the reusable prompt-writing and provenance workflow below.

Read `album/BRIEF.md`, `album/album.json`, the current Settings via the owner's `/api/owner/settings` endpoint, and neighboring track sheets. If the track is new, add its exact title, unique number and slug to `album/album.json`. Do not infer an album rule from a title or ask for one. Ask only about a missing essential; mood and vocals are optional.

Use exactly the requested prompt count. Quick start uses five per track. Small test uses two per track, on one or two tracks (4 takes and about 20 Suno credits per track). Do not say that Suno credit number unless cost matters. Follow the cost rule in `suno-run`. Grok Bot can write all of them. Label its writer **Grok Bot · model undisclosed**. A Cursor comparison requires a real connected execution and its returned artifacts. Distribute the requested slots across available writers; never create extra slots or claim a requested model actually ran without runtime evidence. Each writer must use its own output file or isolated branch if work runs concurrently.

Before writing the sheet, resolve the Suno model from the connected account's supported model list. Auto means the account's reported eligible quality default, never a hardcoded version. If a pinned model is gone, report the migration and check any cost or capability difference. Do not search another interface for a retired model.

Write one serious producer brief per `## p<n> — <lane>` in `album/tracks/<NN>-<slug>.md`. Include `Title field`, `Instrumental`, `Model`, `Lyrics`, and `Exclude` in the preamble. When vocals are instrumental, Lyrics is `[Instrumental]`. When vocals are wanted, Lyrics is the original lyric that `suno-run` sends in Suno's custom mode. Use the requested number of prompt headings and a Canonical files table reflecting the expected output count. Standard Suno generations currently return two takes, but count actual outputs later. Keep all Style paragraphs under 900 characters. Lead with genre and concrete groove, instrumentation, hooks and arrangement. Vary musical lanes meaningfully while honoring the user's stated constraints. The title is only the Suno Title field, and it is the track title already in `album/album.json`. Suno gets that same string. Do not invent a different title for the sheet or for Suno. No title pun, funny premise, or “funny but serious” framing belongs in Style. Do not add lyrical or production cues derived from the joke.

Store prompt provenance for the round: prompt ID, writer host, verified provider and observed model when available, requested model separately, attribution status, revision and execution ID. For Grok Bot, the model is undisclosed. For Cursor, an Auto or requested label is unverified until the runtime record says what ran. Keep owner audit records even if listener details are hidden.

Check the sheet's prompt count, each Style length and the exact musical constraints. Tell the owner the prompts are written, with the track count and the prompt count, before the next step. Follow `publish` only after the publication choice permits it. The next step is `suno-run`; no audio is generated in this skill. Review takes are made public on Suno and stream from the public MP4. They are not downloaded. Never ask how review takes should play. Only a final pick is downloaded, and that download is silent.
