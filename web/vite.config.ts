import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_TURNSTILE_SITE_KEY'];
const envDir = fileURLToPath(new URL('..', import.meta.url)); // the repo root, where .env lives

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = { ...loadEnv(mode, envDir, 'VITE_'), ...process.env };
    const missing = REQUIRED.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing environment variables for the build: ${missing.join(', ')}`);
    }
  }
  return {
    root: import.meta.dirname,
    envDir,
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // No inline scripts, so our Content-Security-Policy can forbid them.
      modulePreload: { polyfill: false },
    },
  };
});
