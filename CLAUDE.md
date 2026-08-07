# CLAUDE.md

## Package manager

This project uses npm for installing dependencies and bun for running scripts.

- Install/update deps: `npm install` / `npm ci`. `package-lock.json` is the lockfile of
  record and CI relies on it.
- Run scripts: `bun run dev` / `bun run build` / `bun run lint` / `bun run preview`.

Do NOT run `bun install` — it would write its own lockfile alongside `package-lock.json`.
(On some setups it also fails outright with `EINVAL: Failed to replace old lockfile with new
lockfile on disk`, e.g. on exFAT volumes where bun's atomic lockfile rename isn't supported.)
`bun run` is unaffected since it doesn't write a lockfile — it just uses whatever's already
in `node_modules`. If bun isn't installed, `npm run <script>` works identically.

CI (`.github/workflows/deploy.yml`) uses `npm ci` + `npm run build`.
