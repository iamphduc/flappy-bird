import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const webPort = Number(process.env.WEB_PORT ?? 3000);
const apiPort = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  build: {
    rollupOptions: {
      // Two pages: the game and "My stats".
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        stats: fileURLToPath(new URL("./stats.html", import.meta.url)),
      },
    },
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      // ws: true also forwards the /api/ws WebSocket upgrade.
      "/api": { target: `http://127.0.0.1:${apiPort}`, ws: true },
    },
  },
});
