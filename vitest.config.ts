import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['tree'],
    include: ['src/**/*.test.ts'],
  },
});
