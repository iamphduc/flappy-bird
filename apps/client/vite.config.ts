/// <reference types="vitest/config" />
import { defineConfig } from "vite";

const webPort = Number(process.env.WEB_PORT ?? 3000);
const apiPort = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      // ws: true also forwards the /api/ws WebSocket upgrade.
      "/api": { target: `http://127.0.0.1:${apiPort}`, ws: true },
    },
  },
  test: {
    // Vitest empties CSS by default, even ?raw imports; theme.test.ts reads the style files as text.
    css: { include: [/\/src\/styles\/[^/]+\.css/] },
  },
});
