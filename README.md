# Album kit

## What this is

Make an instrumental album with Suno, judge every take blind, and share the keepers. A bot sets up your own album site, writes the Suno prompts, runs Suno on your account and uploads every take. You vote on the takes one round at a time without knowing which prompt made which, and the winners go on a page you can share. It's the process behind [mus1c for v3gans](https://music-for-vegans.vercel.app/listen/mus1c-for-v3gans), a 30-song record where Suno made every sound. [Here's how that went](BLOG_POST_URL).

## Make an album

[Add Album Bot](ALBUM_BOT_TEMPLATE_URL) to Grok Bot, then say "let's make an album."

You need:

- **Grok Bot.**
- **Suno Premium.** The bot connects to Suno through Suno's own MCP server, and you sign in with your account. Runs use your own plan's credits, and the songs land in your Suno library.
- **A Vercel account.** The free plan is enough, and you can sign up with email when the bot asks.

You don't need GitHub, a terminal or any code. The bot copies this kit onto its own computer and works from there.

## Own the code

You don't need this part to make an album. It's for people who want the album in their own repo.

**GitHub.** The Deploy button copies the kit into your GitHub account and sets up Vercel Blob storage, a Neon Postgres database and your album key. After that, every push deploys. Then add the bot and send it your repo's link.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sashakhad/album-kit&project-name=my-album&repository-name=my-album&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22postgres%22%2C%22protocol%22%3A%22storage%22%7D%5D&env=ALBUM_KEY&envDescription=Pick%20a%20passcode.%20Only%20you%20can%20vote%20with%20it.)

**Cursor Origin.** Origin repos are private, and the Deploy button doesn't work with them. Ask the bot for an Origin repo instead, and it keeps your album in a private one. Origin repos only deploy on push with Vercel Pro, so the bot keeps deploying with the Vercel CLI, which works on the free plan.

**Local dev.** You need Node 24, pnpm and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm exec prisma migrate deploy
pnpm dev
```

The example env file sets the album key to `dev` and leaves the Blob token out, so the site reads takes from `album/audio/`. Add a track to `album/album.json`, name its takes like `v1-01-<slug>-p1-takea.mp3`, then open http://localhost:3000/key and enter `dev`.

## How it works

1. **Set up.** The bot copies the kit, makes your Vercel project with Blob storage, a Postgres database and an album key, deploys your site and connects Suno.
2. **Frame the album.** It asks for the title, the artist, the genre, the album's one rule and your first track titles, and writes the album's brief.
3. **Write the prompts.** For each track, five writers each draft five Suno prompts on their own. A judge scores them, and the best become the track's sheet.
4. **Run Suno.** The bot runs each prompt once, which makes two takes, then names the files and uploads them to your site.
5. **Judge blind.** You vote on `/vote`. Each take has a nonsense set name and a letter, so you never know which prompt made it. Downvotes leave, upvotes carry, and takes you haven't voted on stay. You start the next round when you're ready.
6. **Share.** When a track is done, you pick its take and the bot pins it to `/listen`, the page you share.

## Costs

- **Suno Premium.** Every run spends credits from your own plan, and each run makes two takes. A track with five prompts is five runs. The bot asks before it spends more than a track's sheet plans.
- **Grok Bot.** The bot runs in your own Grok Bot account, on whatever plan you have.
- **Vercel: free.** The free Hobby plan covers the site, the Blob storage and a Neon Postgres database. It's meant for personal, non-commercial projects.

## FAQ

**What if Suno shows a captcha?** That only happens when the bot uses Suno in its browser instead of the MCP server. The bot stops and asks you to take over its browser, so you solve it and hand it back. If Suno keeps blocking the bot, open `/studio/<track>` on your site. It has every field ready to copy into Suno by hand. Then drop the takes on `/intake`, named the way `/studio` shows.

**What if storage fills up?** Takes live in Vercel Blob, and each one is a few megabytes, so an album with hundreds of takes can outgrow the free plan. When more than 150 takes are stored, or an upload fails for lack of space, the bot offers once to delete the audio for takes you voted out. It asks first, because a downvoted take sometimes becomes a new song, and it never touches parked or pinned takes.

**Who can hear my takes?** Signed-out visitors can only play the takes pinned to `/listen`, and those stream through the site. Every other take is stored at an unlisted address that only your signed-in browser ever sees. The files aren't encrypted, so think of them as unlisted, not secret.

## Credits

Made by [Sasha](https://github.com/sashakhad), from the process behind mus1c for v3gans. The prompt arena uses the `/arena` skill from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan. Suno makes every sound, through each person's own account.
