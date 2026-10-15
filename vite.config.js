import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.PAGES_BASE || './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  server: { fs: { deny: ['.env', '.env.*', '**/research/**', '**/.git/**'] } },
});
