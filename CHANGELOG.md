# Changelog

## 0.1.0 (unreleased)

- 8 scenarios: single valid, duplicate sequential, duplicate concurrent, out-of-order, invalid signature, missing signature, stale timestamp, malformed JSON.
- `reset()` / `observe()` / `settle()` state adapters; unconfigured checks reported as "not tested".
- Fetch-handler and URL targets; Stripe-compatible signing (verified against the official `stripe` library).
- CLI (`run`, `demo`) with exit codes; text, JSON and HTML reports; `assertNoCrashes()` for Vitest/Jest.
- `webhook-crash-lab/bullmq` adapter and `combineAdapters()`, tested against real Redis.
- Bundled broken + fixed demo credits app.
