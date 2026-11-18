# Start a fresh album

Read `.cursor/skills/start-here/SKILL.md` in full and follow its **Begin** section. An explicit `/start` begins a fresh album even if another is in progress. Keep the previous album, takes and scores intact by using a separate album folder.

Use the greeting from **Begin**, including `/help` for commands and `/settings` for the current setup, then ask about their album idea. Follow their choice of Album Bot Lite or Full Setup. Use the existing Suno connection when available. As soon as Suno returns the first playable stream, follow `suno-run` to run `node scripts/preview-album.mjs --record <ready-take.json>` and send `Open Album.html` directly in chat. Offer to publish after the requested album is playable.
