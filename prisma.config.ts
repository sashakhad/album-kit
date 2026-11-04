import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrate holds a session-level advisory lock, which a transaction-mode pooler like Neon's
// can strand on a pooled connection. Neon's integration sets DATABASE_URL_UNPOOLED for this.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use process.env (not env()) so `prisma generate` works without DATABASE_URL.
    ...(url ? { url } : {}),
  },
});
