# Hono + Stripe webhook handler

Hono gives you the raw request body with `c.req.text()`, and `app.fetch` is a standard
`(req: Request) => Response`, so a Hono route is a first-class crash-lab target. This example drives a
real Hono server over HTTP, the same way [`examples/express/`](../express/app.ts) does.

- [`app.ts`](app.ts): the handler. Raw body first, signature check, `event.id` claim, credits once.
- [`server.ts`](server.ts): serves the app on port 3001 and mounts two inspection routes for the
  adapter below.
- [`crash-lab.config.mjs`](crash-lab.config.mjs): the config. URL target plus an HTTP adapter that
  resets and reads the credit balance, so the duplicate scenarios check business state and not only
  the status code.

## Install

In this repository:

```sh
npm ci
npm run build   # the CLI runs from dist/
```

In your own Hono app:

```sh
npm i -D webhook-crash-lab hono
```

## Run

```sh
npx tsx examples/hono/server.ts                               # terminal 1
npx webhook-crash-lab run examples/hono/crash-lab.config.mjs  # terminal 2
```

`npx` fetches `tsx`; any TypeScript runner works. The config reads `HONO_EXAMPLE_URL` and
`STRIPE_WEBHOOK_SECRET` if you moved the server, and `server.ts` reads the same `PORT` and
`STRIPE_WEBHOOK_SECRET` variables.

## What a pass looks like

```text
webhook-crash-lab: checkout.session.completed

  PASS  single-valid           One valid delivery
  PASS  duplicate-sequential   Same event delivered again (retry)
  PASS  duplicate-concurrent   Same event delivered in parallel
  SKIP  out-of-order           Related events arrive out of order
        http status: No `sequence` configured.
        business state: Add `sequence: { events, expected }` to test ordering.
  PASS  invalid-signature      Forged signature
  PASS  missing-signature      No signature header
  PASS  stale-timestamp        Old, replayed delivery
  PASS  malformed-json         Broken JSON body

  7 passed, 0 failed, 1 not tested
```

`out-of-order` stays "not tested" until the config declares a `sequence` of events; crash-lab reports
what it did not check instead of counting it as a pass.

## Break it on purpose

Delete the two `state.processed` lines in `app.ts` and `duplicate-concurrent` fails with
`credits: expected 100, got 500`. Drop the `verifySignature` call and `invalid-signature` fails with
`Expected a 4xx rejection, got 200`. [`test/hono.test.ts`](../../test/hono.test.ts) boots this app in
CI, so either regression fails the build.
