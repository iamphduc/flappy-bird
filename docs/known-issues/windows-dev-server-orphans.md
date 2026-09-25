# Stopping `pnpm dev` on Windows can leave servers running

Killing the `pnpm dev` process (e.g. stopping a background shell task) does not always stop its children on Windows. The `vite` and `tsx watch` node processes keep holding ports 3000/3001, and the next `pnpm dev` fails with a port-in-use error (Vite uses `strictPort`).

**Check:** `netstat -ano | grep -E ':300[01] .*LISTEN'`
**Fix:** find the PIDs, confirm their command line is vite/tsx from this repo, then stop them (PowerShell: `Stop-Process -Id <pid>`).
