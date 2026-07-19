# CLAUDE.md

## Package manager

This project uses npm for installing dependencies and bun for running scripts.

- Install/update deps: `npm install` / `npm ci` (keeps `package-lock.json`, which CI relies on).
- Run scripts: `bun run dev` / `bun run build` / `bun run lint` / `bun run preview`.

Do NOT run `bun install` in this repo (or anywhere on the `D:` drive) — it fails with
`EINVAL: Failed to replace old lockfile with new lockfile on disk`. The `D:` drive is
formatted exFAT, and bun's atomic lockfile rename isn't supported on exFAT. This is a
filesystem limitation, not a project misconfiguration; confirmed by reproducing the same
error in an unrelated throwaway folder on `D:`. `bun run` itself is unaffected since it
doesn't write a lockfile — it just uses whatever's already in `node_modules`.

CI (`.github/workflows/deploy.yml`) uses `npm ci` + `npm run build` and is unaffected by
any of this.
