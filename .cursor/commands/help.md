# Album Bot help

Read the **Commands** section of `.cursor/skills/start-here/SKILL.md`. Answer the creator’s question first, then give the next step for their album. If they ask what they can do, use the commands in that section, including:

- `/start` begins a fresh album and keeps earlier albums. `/surprise` lets Album Bot choose a direction.
- `/help` and `/settings` work before sign-in. Show commands, defaults, and open choices. Do not connect an account or start a round.
- `/refresh <branch-or-SHA>` then `/refresh main` reloads this chat’s instructions only. Report the revision that loaded. Do not create a duplicate job. Do not drop a vote.
- `/listen` rebuilds the player from the existing takes and scores. Do not create a job or drop a vote. The first playable take arrives in the printed `link`. `Open Album.html` is the offline fallback.
- After a take, the next step is the remaining tracks on the album. `/more` makes alternate takes of an existing track. `/pick` helps choose the winners. Those two are secondary. Choose **Add more tracks** after the album is ready, for new songs beyond the current list.
- `/share` publishes the Lite static player or the Full Setup album site on the creator’s Vercel account.
- `/settings` shows the current album setup.
- `/setup` connects a music service when requested. `/upgrade` opens the Suno plan options.
