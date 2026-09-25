import { defineConfig } from "vite";

const webPort = Number(process.env.WEB_PORT ?? 3000);
const apiPort = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
