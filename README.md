# Project Scaffold

A clean, modern scaffold for full-stack web applications built with Next.js App Router, React, TypeScript, Prisma, Tailwind CSS, and shadcn/ui.

---

## Quick Start

This project uses **Cursor commands** to make everything easy. Just type these commands in the Cursor chat:

| Command        | What it does                                                                 |
| -------------- | ---------------------------------------------------------------------------- |
| `/setup`       | Installs everything your project needs                                       |
| `/start`       | Launches your app so you can see it in the browser                           |
| `/new-project` | Creates a fresh copy of this template and pushes it to a private GitHub repo |

---

## Getting Started

### Prerequisites

- **Node.js 24 LTS** (see `.nvmrc` / `.node-version`)
- **pnpm 11** via Corepack (`corepack enable`)

### First Time Setup

1. Open this folder in Cursor
2. Open the chat (click the chat icon or press `Cmd+L` / `Ctrl+L`)
3. Type `/setup` and press Enter
4. Wait for everything to install (takes 1-2 minutes)
5. Type `/start` to launch your app
6. Open http://localhost:3000 in your browser

**That's it for the demo UI.** Postgres is optional until you need the database.

### Optional database

```bash
cp .env.example .env
pnpm run db:up        # local Postgres via Docker
pnpm run db:migrate   # apply the initial schema
```

Or paste a hosted `DATABASE_URL` into `.env` and run `pnpm run db:migrate`.

---

## Starting a New Project

Want to create a new project using this template?

1. Type `/new-project` in the chat
2. Enter a name for your project (like `my-cool-app`)
3. Choose whether the private GitHub repo should live under your personal account or an available organization
4. Follow the instructions to open your new project folder in Cursor
5. Run `/setup` in the new project
6. Run `/start` to launch it

`/new-project` creates a local folder and private GitHub repo only. It does not deploy to Vercel.

---

## What's Included

This scaffold comes with modern tools pre-configured:

- **Next.js** with App Router and Turbopack
- **React** with strict TypeScript configuration
- **Prisma** with a PostgreSQL adapter (optional until you need a DB)
- **Tailwind CSS** for styling
- **shadcn/ui** with Radix UI components
- **React Hook Form** with Zod validation
- **Vitest** and Testing Library for unit/component tests
- **Storybook** with Vitest browser + accessibility tests
- **Cypress** for end-to-end smoke tests
- **ESLint** and **Prettier** for code quality

---

## For Developers

<details>
<summary>Click to expand developer documentation</summary>

### Manual Commands

If you prefer using the terminal directly:

```bash
# Enable package manager
corepack enable
corepack prepare pnpm@11.13.1 --activate

# Install dependencies
pnpm install

# Aggregate quality checks
pnpm run check

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Unit tests (Vitest)
pnpm test

# Storybook browser tests
pnpm run test:storybook

# End-to-end smoke tests (builds + starts the app; installs Cypress binary on demand)
pnpm run test:e2e

# Start Storybook
pnpm run storybook

# Type-check the project
pnpm run type-check

# Database commands
pnpm run db:up          # start local Postgres (Docker)
pnpm run db:down        # stop local Postgres
pnpm run db:generate    # Generate Prisma client
pnpm run db:migrate     # Run migrations
pnpm run db:push        # Push schema without migrations
pnpm run db:studio      # Open database UI
```

### Project Structure

```
src/
├── app/                 # Pages and layouts
├── components/          # Reusable UI components
│   └── ui/             # shadcn/ui components
├── lib/                # Utility functions
└── stories/            # Storybook stories

prisma/
├── schema.prisma       # Database schema
└── migrations/         # SQL migrations

.cursor/
└── commands/           # Cursor slash commands
```

### Adding UI Components

```bash
pnpm dlx shadcn@latest add [component-name]
```

</details>

---

## Need Help?

- Type your question in the Cursor chat - the AI can help!
- Check the [Next.js docs](https://nextjs.org/docs)
- Check the [Tailwind CSS docs](https://tailwindcss.com/docs)
