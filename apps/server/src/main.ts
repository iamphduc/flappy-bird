import { buildApp } from "./app.ts";

const port = Number(process.env.API_PORT ?? 3001);
const app = buildApp();

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`server listening on http://127.0.0.1:${port}`);
});
