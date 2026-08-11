import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['tree'],
    projects: [
      {
        test: {
          name: 'fast',
          include: ['src/**/*.test.ts', 'packages/**/*.test.ts'],
          exclude: ['src/**/*.postgres.test.ts', 'tests/http/**/*.http.test.ts'],
        },
      },
      {
        test: {
          name: 'postgres',
          include: ['src/**/*.postgres.test.ts'],
          globalSetup: ['./tests/postgres/setup.ts'],
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'http',
          include: ['tests/http/**/*.http.test.ts'],
          globalSetup: ['./tests/postgres/setup.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
