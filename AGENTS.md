# Album kit

This repo makes one album with Suno and gives it a site where the owner judges every take blind. The album lives in `album/`: `album.json`, `BRIEF.md` and one sheet per track in `album/tracks/`. The site reads those files, so changing the album never means changing code.

## Skills

The playbook is in `.cursor/skills/`. Read a skill's whole `SKILL.md` before you start its steps.

- `start-here`: first run. Prepares the local album, gets the user signed in to Suno and writes the album brief.
- `album-track`: frames a new track and ships its sheet; runs a prompt arena when requested.
- `song-prompts`: writes or revises track-specific Suno prompts, keeping source context, model choices and provenance in the sheet.
- `suno-run`: runs a sheet's prompts in Suno, names the takes and stores their stream URLs.
- `judge`: rounds on `/vote`, and parking, promoting, extracting or renaming takes.
- `finish`: pins the chosen takes to `/listen` on a hosted voting site.
- `publish`: redeploys a shared voting app on the creator’s Vercel project. A GitHub or Origin backup is available on request.

For any new album, run `start-here` first.

## Rules

- Never call full mixes stems. A take is a full mix. Stems are the separate files a split makes, several per song.
- Sasha never hosts Album Bot for anyone. In Lite and Full Setup, send the local player as soon as the first take is playable. When every requested take is playable, ask “Your album is ready. What’s next?” Offer **Share album** and **Add more tracks** with a free-text reply. Lite shares the standalone listening page. Full Setup builds the Next.js app from the selected revision of `sashakhad/album-kit` with the creator’s actual tracks. Verify the album and audio on the creator’s Vercel project before returning its listening link, and send that link only when the share command has printed that project’s id and account id. Adding tracks makes new songs on the same album, preserving its existing recordings, scores and pass. Ask once per completed batch.
- Never take "done" from an agent, yourself included, without seeing the files.
- The joke stays in the title. Keep it out of the Style prompt.
- For a kit release, check the changes and merge the upstream PR. To update a creator's existing album, run the fresh kit’s `pnpm kit:update <existing-album-directory>`. Preserve the creator’s entire `album/` directory, local scores, settings, credentials and Vercel project link. For a requested production update, publish from that album directory to its linked project and verify its public listening and voting pages.
- A creator can make, host and update an album without GitHub. Set up a repository only for an explicitly requested backup.

## Other assistants

ChatGPT and Claude can try these same instructions with the tools their own session provides. Read this file and the skills under `.cursor/skills/`. Grok Bot with Cursor is the supported path for Album Bot Lite, Full Setup, and the writer comparison. Support on other hosts will vary. This note is best-effort: those hosts are not integrated or tested here.
