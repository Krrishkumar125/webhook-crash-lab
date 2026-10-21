# Changelog

## 0.3.0 (2026-10-22)

- TypeScript configs: `crash-lab.config.ts` / `.mts` / `.cts` load through jiti when installed (optional peer
  dependency), otherwise Node's built-in type stripping, with a clear error explaining both (#2).
- `run` without a path finds `crash-lab.config.{mjs,js,ts,mts,cjs,cts}`. `init <file>.ts` writes a TypeScript starter.
- New exports: `loadConfig`, `findConfig`, `CONFIG_FILES`. Configs are re-read on every load, so edits are picked up.
- CI adds a Windows job.

## 0.2.0 (2026-10-21)

First public release.

- `webhook-crash-lab init` writes a commented starter `crash-lab.config.mjs` (never overwrites).
- `provider: 'github'` signs with `X-Hub-Signature-256`; `signGithub` / `verifyGithub` helpers. `stale-timestamp` is reported as not tested for this scheme.
- Examples: Express (tested in CI against a real server) and Next.js App Router + Prisma (SQLite).
- `demo --mode` validates its value.

## 0.1.0 (not published)

- 8 scenarios: single valid, duplicate sequential, duplicate concurrent, out-of-order, invalid signature, missing signature, stale timestamp, malformed JSON.
- `reset()` / `observe()` / `settle()` state adapters; unconfigured checks reported as "not tested".
- Fetch-handler and URL targets; Stripe-compatible signing (verified against the official `stripe` library).
- CLI (`run`, `demo`) with exit codes; text, JSON and HTML reports; `assertNoCrashes()` for Vitest/Jest.
- `webhook-crash-lab/bullmq` adapter and `combineAdapters()`, tested against real Redis.
- Bundled broken + fixed demo credits app.
