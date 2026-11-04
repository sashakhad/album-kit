# Help - Available Commands

Show the user all available Cursor commands and guide them on what to do.

## Instructions for AI

Display this information in a friendly, clear way:

---

## Welcome! Here are the commands you can use:

### `/setup`

**Run this first!** Installs everything your project needs to work.

- Enables pnpm via Corepack
- Downloads all project dependencies from the lockfile
- Creates `.env` from `.env.example`
- Optionally sets up Postgres (Docker or hosted URL)
- Takes about 1-2 minutes

### `/start`

**Launches your app** so you can see it in the browser.

- Starts the development server
- Open http://localhost:3000 to see your app
- Changes you make will auto-refresh!
- Database is optional for the demo UI

### `/new-project`

**Creates a fresh copy** of this template for a new project.

- Prompts you to name your new project
- Copies everything to a new folder (keeps `pnpm-lock.yaml`)
- Lets you choose your personal GitHub account or an available organization
- Creates a private GitHub repo and pushes the initial commit
- Guides you to open it in Cursor

### `/update`

**Gets the latest scaffold updates** from the main repository.

- Pulls new features and fixes
- Warns you if you have uncommitted changes
- Only works in the scaffold template (not derived projects)

### `/bump-scaffold`

**Maintainer command** to roll the scaffold forward to the next monthly version.

- Previews the rename before making changes
- Can rename the GitHub repo and local folder
- Can stop at the PR or wait and merge after CI

### `/help`

**You're here!** Shows this list of commands.

---

## Suggested Workflow

**First time?** Do this:

1. Type `/setup` and wait for it to finish
2. Type `/start` to launch your app
3. Open http://localhost:3000 in your browser

**Starting a new project?**

1. Type `/new-project`
2. Give your project a name when asked
3. Choose where to create the private GitHub repo
4. Open the new project folder in Cursor
5. Run `/setup` in the new project

**Want the latest scaffold improvements?**

1. Type `/update` to pull the latest changes
2. Run `/setup` if dependencies changed

**Maintaining the scaffold itself?**

1. Type `/bump-scaffold`
2. Review the dry-run preview carefully
3. Confirm the PR, repo rename, and final local path rename

**Need help anytime?**

- Type `/help` to see this guide
- Or just ask me anything in the chat!

---

## Tone

Be warm and welcoming. This is likely a non-technical user who needs clear guidance. Make them feel supported and confident they can do this!
