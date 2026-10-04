import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only: lets the page POST a canvas capture (data URL) to /__snapshot,
 * saved as .snapshots/<name>.png. Used for render checks without a visible window.
 */
function snapshotPlugin(): Plugin {
  return {
    name: 'sweepline-dev-snapshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snapshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          const url = new URL(req.url ?? '/', 'http://localhost');
          const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w-]/g, '');
          const dir = resolve(process.cwd(), '.snapshots');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.png`), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), snapshotPlugin()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
});
