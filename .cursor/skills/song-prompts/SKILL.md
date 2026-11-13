---
name: song-prompts
description: Write or revise album-specific Suno Style prompts for a track, including More like this requests, while preserving source context, editable model choices, and prompt provenance. Does not generate audio.
---

# Song prompts

Use this skill when the owner asks for a new prompt suite or a revision of one track's prompts. `album-track` handles the catalog and sheet, and `suno-run` handles paid music generation. This skill writes prompts only.

## Frame the track

Read `album/album.json`, `album/BRIEF.md`, this track's sheet (if any), neighboring sheets, and this album's saved Settings (`/api/owner/settings` or `pnpm album:settings`). Use the artist, genre, album arc, owner's actual words, existing sonic constraints, and the musical ground neighboring tracks already occupy. If the album brief or a requested track is missing, ask for that essential. Do not replace a specific artist/album identity with a generic songwriting template. A title joke belongs in the Suno Title field; do not derive musical cues from it.

For **More like this**, read the durable `GET /api/owner/variations` request, selected track sheet, parent take's saved prompt/provenance and the owner's edit instructions. Stay on that track. The parent is a full mix, not stems. Describe the sound to preserve and the requested change; do not copy a different track's identity. Keep the parent filename, request ID and exact instructions for the eventual round snapshot and each new take's lineage.

Choose the creation mode from the owner's intent: a text variation in **Blank Create** uses the parent as reference context but does not preserve its audio; **Cover/Remix** must use a supported Suno operation on the actual parent audio when preserving its hook or performance is requested. Check that operation's current capability and cost separately. The [S0Y-MAR1ACHI synthesis](../../../examples/mus1c-for-v3gans/S0Y-MAR1ACHI-SYNTHESIS.md) records why a new text prompt alone was insufficient for its Cover job.

## Choose models without interrupting the ordinary flow

Use the album's saved `promptWriter`, `promptWriterModel` and `sunoModel` as defaults. The owner may change these in **Album Settings → Generation** (writer model under Advanced music settings) or explicitly override a round. Do not reset a previous album selection when choosing a preset. The prompt writer model and the Suno music model are different choices.

- Grok Bot writes with **Grok Bot · model undisclosed**. Its underlying model cannot be selected or verified from this kit. Do not translate `promptWriterModel` into a claim about Grok Bot.
- For Cursor, `auto` requests its runtime default. A named model is a request, not evidence of execution. Use a real connected Cursor execution; record the actual host, provider, observed model and execution ID from its runtime record. If Cursor is unavailable, leave that path pending or use Grok Bot only if the owner permits the change.
- For Suno, `auto` means the connected account's reported quality default. Refresh the account's available model IDs, eligibility, capabilities and model-specific cost before a round. A pinned model must be in that list. A saved choice that is gone needs an explicit migration report and fresh cost check. Public documentation can explain model behavior, but it cannot prove this account's eligibility. Do not silently choose by version number or treat a model name in a sheet as a live capability check.

The ordinary flow uses the saved choices without a per-song model discussion. When a model change alters cost, output count, compatibility or the sound the owner requested, explain that difference before the round is authorized. Never invent pricing or assume that faster, newer or more experimental is universally better.

## Write and check

Produce exactly the requested number of distinct musical lanes. Put genre and concrete groove early; describe defining sounds, arrangement, hooks, dynamics and a useful production direction. Honor the album job, vocals and constraints. Keep each Style paragraph under 900 characters. Keep the joke, title, funny framing and vocal negations out of Style; use the Title, Instrumental, Lyrics and Exclude fields for their intended roles. Apply `src/lib/rounds/prompt-quality.ts` and check the sheet's count and the owner's exact constraints. For a variation, check that the revision preserves the parent's requested features and applies the edit instructions without changing tracks.

For a requested **multi-writer comparison**, keep each real writer's candidates isolated and use an independent cross-judge when available. Save a synthesis note with the track job, candidate and judge scores, chosen base, the source of each grafted final prompt, and rejected lanes with reasons. [The Photosynthesupersizeme synthesis](../../../examples/mus1c-for-v3gans/PHOTOSYNTHESUPERSIZEME-SYNTHESIS.md) shows the evidence to preserve. Scale the comparison to the owner's requested prompt count and verified model access; the example's five writers and 25 candidates are not a default. Never attribute a graft or model run without its actual artifact and runtime record.

Persist the result in `album/tracks/<NN>-<slug>.md`, not only chat. Include a short **Source context** section naming the album brief, relevant neighboring sheets, parent take when applicable, and which owner instructions shaped the prompt. In the sheet's preamble record the saved or overridden Suno model policy and the resolved model only after a live check. For each `p<n>` retain a provenance row with prompt ID, writer host, requested model, verified provider/observed model or `unverified`, attribution status, revision and execution ID. For Grok Bot use `undisclosed`; never fabricate an observed model. Keep the Canonical files table tied to the actual expected take count, then update it for actual outputs after generation. Preserve earlier provenance revisions when editing a prompt.

The same attribution is sent in `POST /api/owner/rounds` so the immutable round snapshot and eventual `TakeProvenance` keep it with the audio. A variation round sends `variationRequestId`, one track and one prompt; the round and take records carry the parent filename and edit instructions. A sheet is the editable source, while the round snapshot records exactly what was approved and run.

Stop after the prompt sheet. A saved model preference, written Style, or More like this request never authorizes Suno spending. Follow `suno-run` for live capabilities, estimate, explicit round allowance, operation IDs, generation, and intake. Respect any generation HOLD, including GOR-41; do not bypass it to test this skill.
