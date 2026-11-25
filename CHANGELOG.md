# Changelog

## 0.4.0 (2026-11-26)

- New scenario `retry-after-failure`: your adapter's optional `failNextEffect()` makes the next business write throw once, crash-lab delivers the event, then delivers it again as the provider retry. It fails handlers that save the event id before the write (the retry is skipped as a duplicate and the payment is lost) and handlers that answer 2xx after a failed write (the provider never retries). Not tested when the adapter has no `failNextEffect`.
- New providers: `razorpay` (`X-Razorpay-Signature` hex HMAC of the raw body, plus `X-Razorpay-Event-Id`) and `standard` ([Standard Webhooks](https://www.standardwebhooks.com): `webhook-id`, `webhook-timestamp`, `webhook-signature`). `stale-timestamp` is tested for `standard` and reported as not tested for `razorpay`. New exports: `signRazorpay`, `verifyRazorpay`, `signStandard`, `verifyStandard`, `PROVIDERS`.
- `github` deliveries now also carry an `X-GitHub-Delivery` header with the event id.
- GitHub Action (`uses: Krrishkumar125/webhook-crash-lab@v0.4.0`): runs `webhook-crash-lab run`, writes the HTML report, adds the results to the job summary and fails the job on any failed scenario.
- Demo: the broken handler now also saves the event before doing the work, so it fails 6 of 9 checks; the fixed handler releases its claim when the work fails and passes all 9.
- An unknown `provider` now throws before any delivery.
- README: provider table and a comparison with webhook-chaos and the Stripe CLI.

## 0.3.4 (2026-11-15)

- `demo`: the broken run header now reads `=== BROKEN handler ===`, so the terminal output matches the README.

## 0.3.3 (2026-10-25)

- README: npm weekly downloads badge (docs only, no code changes).

## 0.3.2 (2026-10-23)

- npm metadata: shorter description, focused keywords, homepage/bugs links; README links sibling packages.

## 0.3.0 (2026-10-22)

- TypeScript configs: `crash-lab.config.ts` / `.mts` / `.cts` load through jiti when installed (optional peer
  dependency), otherwise Node's built-in type stripping, with a clear error explaining both (#2).
- `run` without a path finds `crash-lab.config.{mjs,js,ts,mts,cjs,cts}`. `init <file>.ts` writes a TypeScript starter.
- New exports: `loadConfig`, `findConfig`, `CONFIG_FILES`. Configs are re-read on every load, so edits are picked up.
- jiti resolves imports relative to the config file, and `loadConfig` works from the CommonJS build too.
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
