import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: { name: 'web', include: ['web/src/**/*.test.{ts,tsx}'], environment: 'jsdom' },
      },
      {
        // Database tests need a Postgres to talk to (DATABASE_URL).
        // They run one file at a time because they share one database.
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
