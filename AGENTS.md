# Album kit

This repo makes one album with Suno and gives it a site where the owner judges every take blind. The album lives in `album/`: `album.json`, `BRIEF.md` and one sheet per track in `album/tracks/`. The site reads those files, so changing the album never means changing code.

## Skills

The playbook is in `.cursor/skills/`. Read a skill's whole `SKILL.md` before you start its steps.

- `start-here`: first run. Copies the kit, sets up the album site, gets the user signed in to Suno and writes the album brief.
- `album-track`: frames a new track, runs the prompt arena and ships the track sheet.
- `suno-run`: runs a sheet's prompts in Suno, names the takes and stores their stream URLs.
- `judge`: rounds on `/vote`, and parking, promoting, extracting or renaming takes.
- `finish`: pins the chosen takes to `/listen` and shares the link.
- `publish`: commits and deploys album changes, and gives the album a GitHub or Origin home.

For any new album, run `start-here` first.

## Rules

- Never call full mixes stems. A take is a full mix. Stems are the separate files a split makes, several per song.
- Never take "done" from an agent, yourself included, without seeing the files.
- The joke stays in the title. Keep it out of the Style prompt.
- Ship completed kit changes to production: merge the upstream PR, update the user-owned album repository without replacing its `album/` content, and verify the linked Vercel production deployment and listening URL. A merged kit PR alone is not done.
