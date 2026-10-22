# webhook-crash-lab

**HTTP 200 does not mean your webhook is correct.**

`webhook-crash-lab` crash-tests a Stripe-style webhook handler on your machine or in CI. It replays the deliveries that break real apps (duplicates, parallel retries, out-of-order events, forged, unsigned, stale and malformed requests) and then checks your **business state**: credits granted once, one ledger row, one BullMQ job.

[![CI](https://github.com/Krrishkumar125/webhook-crash-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Krrishkumar125/webhook-crash-lab/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/webhook-crash-lab)](https://www.npmjs.com/package/webhook-crash-lab)
[![downloads](https://img.shields.io/npm/dm/webhook-crash-lab)](https://www.npmjs.com/package/webhook-crash-lab)
MIT · TypeScript · zero runtime dependencies · Node 20+

## 60-second demo

```bash
npx webhook-crash-lab demo --html report.html
```

This runs a bundled "AI credits" app twice: first the kind of handler AI tools often generate, then the fixed version.

```
=== BROKEN handler (typical AI-generated code) ===
  PASS  single-valid           One valid delivery
  PASS  duplicate-sequential   Same event delivered again (retry)
  FAIL  duplicate-concurrent   Same event delivered in parallel
        business state: credits: expected 100, got 500; ledgerEntries: expected 1, got 5; jobs: expected 1, got 5.
        Fix: Claim the event id atomically (INSERT ... ON CONFLICT DO NOTHING, Redis SET NX, BullMQ jobId = event.id) ...
  FAIL  out-of-order           Related events arrive out of order
  PASS  invalid-signature      Forged signature
  FAIL  missing-signature      No signature header        -> crashed with 500
  FAIL  stale-timestamp        Old, replayed delivery     -> accepted, granted credits
  FAIL  malformed-json         Broken JSON body           -> crashed with 500
  3 passed, 5 failed, 0 not tested

=== FIXED handler ===
  8 passed, 0 failed, 0 not tested
```

Open `report.html` for a plain-English version you can share with a non-technical cofounder. The demo source is in [`src/demo/app.ts`](src/demo/app.ts).

## Use it in your tests (Vitest / Jest)

```ts
import { runCrashLab, assertNoCrashes } from 'webhook-crash-lab';
import { app } from '../src/app'; // Hono, or any (req: Request) => Response handler
import { db } from '../src/db';

it('stripe webhook survives duplicate, concurrent and out-of-order delivery', async () => {
  const result = await runCrashLab({
    target: (req) => app.fetch(req), // or a URL: 'http://localhost:3000/webhooks/stripe'
    secret: 'whsec_test_secret', // the secret your handler verifies with in tests
    event: {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { userId: 'u1' } } },
    },
    adapter: {
      reset: () => db.truncateAll(),
      observe: async () => ({
        credits: await db.credits('u1'),
        ledgerEntries: await db.ledger.count(),
      }),
    },
    expect: { once: { credits: 100, ledgerEntries: 1 } },
    sequence: {
      events: [
        ,/* checkout.session.completed */
        /* charge.refunded */
      ],
      expected: { credits: 0 },
    },
  });
  assertNoCrashes(result); // throws a readable report listing what failed and how to fix it
});
```

## Scenarios

| id                     | sends                           | passes when                                |
| ---------------------- | ------------------------------- | ------------------------------------------ |
| `single-valid`         | the event once                  | 2xx, state equals `expect.once`            |
| `duplicate-sequential` | the same event 3× in a row      | 2xx each, state still equals `expect.once` |
| `duplicate-concurrent` | 5 identical copies in parallel  | 2xx each, state still equals `expect.once` |
| `out-of-order`         | your `sequence` reversed        | no 5xx, state equals `sequence.expected`   |
| `invalid-signature`    | signed with the wrong secret    | 4xx, state unchanged                       |
| `missing-signature`    | no signature header             | 4xx (not 500), state unchanged             |
| `stale-timestamp`      | valid signature, 10 minutes old | 4xx, state unchanged                       |
| `malformed-json`       | valid signature, truncated body | 4xx (not 500), state unchanged             |

**Nothing is silently passed.** If you don't give an adapter, `expect.once` or `sequence`, those checks are reported as **not tested**.

**Every delivery has a deadline.** A handler that doesn't respond within `timeoutMs` (default 10000) fails the scenario instead of hanging the run, and the request's `signal` is aborted so your handler can stop work.

Signatures use Stripe's `t=...,v1=...` HMAC-SHA256 scheme and are verified against the official `stripe` library in this repo's tests.

## Examples

- [Express](examples/express/app.ts): raw body, signature check, atomic claim. Tested in CI against a real server.
- [Next.js App Router + Prisma](examples/nextjs-prisma/README.md): pass the route's `POST` straight in, unique `eventId` as the claim.

## GitHub webhooks

Set `provider: 'github'` to sign with `X-Hub-Signature-256: sha256=...`. GitHub signatures have no timestamp, so `stale-timestamp` is reported as not tested.

## BullMQ: one webhook, one job

```ts
import { Queue } from 'bullmq';
import { bullmqAdapter, combineAdapters } from 'webhook-crash-lab/bullmq';

const receipts = new Queue('receipts-test', { connection });
adapter: combineAdapters(dbAdapter, bullmqAdapter({ queue: receipts, key: 'receiptJobs' })),
expect: { once: { credits: 100, receiptJobs: 1 } },
```

`reset()` obliterates the queue, so point it at a test queue only. The usual fix is `queue.add(name, data, { jobId: event.id })`. Starting a new service? [create-bullmq-app](https://github.com/Krrishkumar125/create-bullmq-app) scaffolds idempotent producers out of the box.

## CLI and CI

```bash
npx webhook-crash-lab init                     # writes a commented crash-lab.config.mjs
npx webhook-crash-lab init crash-lab.config.ts  # or a TypeScript one
npx webhook-crash-lab run --html crash-report.html --json crash-report.json
```

`run` without a path picks the first of `crash-lab.config.{mjs,js,ts,mts,cjs,cts}`. The config file default-exports the
same object `runCrashLab` takes. **TypeScript configs** load through [jiti](https://github.com/unjs/jiti) when it is
installed (`npm i -D jiti`; handles extensionless imports of your app), otherwise through Node's built-in type
stripping (Node 22.18+). `loadConfig(path)` is exported for tools that want the same behaviour. Works with `npx`,
`pnpm dlx` and `bunx`. Exit codes: `0` no failures, `1` failures found, `2` config or usage error.

## What it does not do

It does not certify payment security, simulate Stripe's billing engine, touch live data or make charges, or fix your code. It tests the invariants you declare. Run it against test databases and test queues only.

## Companion tools

- [eslint-plugin-webhook-safety](https://github.com/Krrishkumar125/eslint-plugin-webhook-safety) finds the same bugs statically: JSON body parsed before the Stripe signature check, missing verification, no `event.id` dedupe, and BullMQ jobs without `jobId`.
- [eslint-plugin-bullmq](https://github.com/Krrishkumar125/eslint-plugin-bullmq) covers BullMQ production pitfalls: missing error listeners, `maxRetriesPerRequest`, invalid job ids, and dedupe broken by `removeOnComplete`.
- [webhook-crash-lab-mcp](https://github.com/Krrishkumar125/webhook-crash-lab-mcp) is an MCP server, Claude Code plugin and Codex skill. It lets coding agents run crash-lab, fix the handler, and re-run until it passes.

## Prior art

[Hookproof](https://hookproof.dev) runs a similar set of adversarial checks as a hosted service. Stripe CLI (`stripe trigger`) generates real events, and Hookdeck handles production delivery and replay. webhook-crash-lab is the open-source, in-your-test-suite option with adapters that read your own DB and queues.

## Sibling packages

Other tools by the same author:

- [secret-blast-radius](https://www.npmjs.com/package/secret-blast-radius): what a malicious npm install could steal, plus a rotation plan
- [zod-india](https://www.npmjs.com/package/zod-india): Zod schemas for GSTIN, PAN, IFSC, UPI and Aadhaar
- [create-bullmq-app](https://www.npmjs.com/package/create-bullmq-app): scaffold a production BullMQ + TypeScript service
- [webhook-crash-lab-mcp](https://www.npmjs.com/package/webhook-crash-lab-mcp): MCP server so coding agents can run webhook-crash-lab
- [eslint-plugin-bullmq](https://www.npmjs.com/package/eslint-plugin-bullmq): lint rules for BullMQ production pitfalls
- [eslint-plugin-webhook-safety](https://www.npmjs.com/package/eslint-plugin-webhook-safety): lint rules for unsafe Stripe webhook handlers

## License

MIT © Krrish Kumar
