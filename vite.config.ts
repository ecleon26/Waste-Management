import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react() as never],
  test: {
    // Vitest config — pure Node env is sufficient for Queue<T> unit tests
    environment: 'node',
  },
});
