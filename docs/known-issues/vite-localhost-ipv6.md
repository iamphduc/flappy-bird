# Vite listens on `localhost` (IPv6), not `127.0.0.1`

On this Windows + Node 24 setup, the Vite dev server binds `[::1]`. `curl http://127.0.0.1:3000` fails to connect, while `http://localhost:3000` works. The API server binds `127.0.0.1` explicitly, and the Vite proxy points there.

**Rule:** open the client at `http://localhost:<WEB_PORT>`. Don't hard-code `127.0.0.1` for the client URL in scripts or tests.
