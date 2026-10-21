import type { ScenarioId } from './types.js';

export type Expectation = 'accept-once' | 'reject' | 'sequence';

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  expectation: Expectation;
  what: string;
  why: string;
  fix: string;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'single-valid',
    title: 'One valid delivery',
    expectation: 'accept-once',
    what: 'Sends the event once with a valid, fresh signature.',
    why: 'Baseline: the happy path must return 2xx and apply the effect exactly once.',
    fix: 'Make sure the handler verifies the raw body and returns 2xx after the work is durably recorded.',
  },
  {
    id: 'duplicate-sequential',
    title: 'Same event delivered again (retry)',
    expectation: 'accept-once',
    what: 'Sends the identical event several times, one after another.',
    why: 'Stripe retries and can deliver the same event more than once. Credits must not be granted twice.',
    fix: 'Store processed event ids (unique constraint) and skip ones you have already handled, still returning 2xx.',
  },
  {
    id: 'duplicate-concurrent',
    title: 'Same event delivered in parallel',
    expectation: 'accept-once',
    what: 'Sends several identical copies at the same moment.',
    why: '"Check then insert" dedupe races: two requests both see "not processed" and the effect is granted twice.',
    fix: 'Claim the event id atomically (INSERT ... ON CONFLICT DO NOTHING, Redis SET NX, BullMQ jobId = event.id) before doing the work.',
  },
  {
    id: 'out-of-order',
    title: 'Related events arrive out of order',
    expectation: 'sequence',
    what: 'Delivers your event sequence in reverse order (e.g. refund before the purchase).',
    why: 'Stripe does not guarantee event order. A refund that arrives first must not be lost.',
    fix: 'Record late-arriving facts (tombstones / status with timestamps) or re-fetch the object from the API before applying.',
  },
  {
    id: 'invalid-signature',
    title: 'Forged signature',
    expectation: 'reject',
    what: 'Sends the event signed with the wrong secret.',
    why: 'Anyone can POST to your webhook URL. Unsigned or forged events could grant free credits.',
    fix: 'Verify the Stripe-Signature header against the raw body with your endpoint secret; respond 400 on failure.',
  },
  {
    id: 'missing-signature',
    title: 'No signature header',
    expectation: 'reject',
    what: 'Sends the event with no signature header at all.',
    why: 'Handlers often crash (500) on a missing header, and Stripe-like senders then retry forever.',
    fix: 'Treat a missing header as invalid and return 400 before parsing.',
  },
  {
    id: 'stale-timestamp',
    title: 'Old, replayed delivery',
    expectation: 'reject',
    what: 'Sends a correctly signed event whose timestamp is 10 minutes old.',
    why: 'Without a timestamp tolerance, a captured request can be replayed later.',
    fix: 'Reject signatures older than 5 minutes (stripe.webhooks.constructEvent does this by default).',
  },
  {
    id: 'malformed-json',
    title: 'Broken JSON body',
    expectation: 'reject',
    what: 'Sends a correctly signed but truncated JSON body.',
    why: 'An unhandled JSON.parse throws a 500 instead of a clean 400.',
    fix: 'Wrap parsing in try/catch and return 400 for bodies that are not valid JSON.',
  },
];
