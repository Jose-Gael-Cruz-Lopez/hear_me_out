import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Only the database address and name reach the browser. Never expose SPACETIMEDB_TOKEN or API keys here.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../..'), '');
  const uri = env.VITE_SPACETIMEDB_URI || env.SPACETIMEDB_URI || 'ws://127.0.0.1:3000';
  const db = env.VITE_SPACETIMEDB_DB_NAME || env.SPACETIMEDB_DB_NAME || 'hear-me-out';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SPACETIMEDB_URI': JSON.stringify(uri),
      'import.meta.env.VITE_SPACETIMEDB_DB_NAME': JSON.stringify(db),
      'import.meta.env.VITE_DEMO_LOCATION': JSON.stringify(env.DEMO_LOCATION || ''),
    },
    server: { port: 5173 },
  };
});
