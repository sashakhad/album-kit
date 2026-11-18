import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        resolve: {
          tsconfigPaths: true,
        },
        plugins: [react()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          env: {
            // Fixture CDN urls are not public objects. Production omits this and embeds them.
            ALBUM_PREVIEW_EMBED: '0',
          },
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
        },
      },
    ],
  },
});
