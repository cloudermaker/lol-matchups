import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import rootPackage from '../package.json';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['@testing-library/jest-dom/vitest'] },
});
