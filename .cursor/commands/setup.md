# Setup Project

Set up this project by installing dependencies and configuring the environment.

## Steps

1. **Enable pnpm via Corepack** (preferred over a global npm install):

   ```bash
   corepack enable
   corepack prepare pnpm@11.13.1 --activate
   ```
   - Confirm with `pnpm --version` (should report 11.13.1)
   - Node.js 24+ is required (`node --version`). If needed, install Node 24 LTS first.

2. **Install dependencies** - Run `pnpm install` in the project root (needs network permission)
   - This uses the committed `pnpm-lock.yaml` for reproducible installs
   - Prisma client generation runs automatically via `postinstall`
   - Let the user know this takes 1-2 minutes

3. **Create `.env` from the example** if `.env` does not exist:

   ```bash
   cp .env.example .env
   ```

4. **Database is optional for the demo UI.** Ask whether the user wants a database now:
   - **Skip for now (default)** — they can run `/start` immediately. Prisma is ready when they add a real `DATABASE_URL` later.
   - **Local Postgres with Docker** — if Docker is available:
     ```bash
     pnpm run db:up
     pnpm run db:migrate
     ```
     Use the default `DATABASE_URL` from `.env.example`.
   - **Hosted Postgres** — ask them to paste a connection string into `.env`, then run:
     ```bash
     pnpm run db:migrate
     ```

5. **Success message** - Tell the user:
   - Setup complete
   - Run `/start` to launch the development server
   - The app will be at http://localhost:3000
   - Mention that database commands (`pnpm db:up`, `pnpm db:migrate`, `pnpm db:studio`) are available when they need Postgres

## Tone

Be friendly and encouraging. Explain each step as you go so the user understands what's happening. If something fails, explain it simply and suggest a fix. Do not block first launch on Docker or a hosted database.
