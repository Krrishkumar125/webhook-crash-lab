export type State = Record<string, unknown>;

export interface WebhookEvent {
  id: string;
  type: string;
  created?: number;
  data?: unknown;
  [key: string]: unknown;
}

/** A URL, or a fetch-style handler such as a Hono app's `fetch` or a Next.js route `POST`. */
export type Target = string | ((req: Request) => Response | Promise<Response>);

/** Tells crash-lab how to reset and read your app's business state. */
export interface StateAdapter<S extends State = State> {
  /** Wipe state back to a clean baseline before every scenario. */
  reset(): void | Promise<void>;
  /** Return the numbers that matter, e.g. `{ credits: 100, ledgerEntries: 1, jobs: 1 }`. */
  observe(): S | Promise<S>;
  /** Optional: wait for async work (queues, outbox) to finish before observing. */
  settle?(): void | Promise<void>;
}

export type ScenarioId =
  | 'single-valid'
  | 'duplicate-sequential'
  | 'duplicate-concurrent'
  | 'out-of-order'
  | 'invalid-signature'
  | 'missing-signature'
  | 'stale-timestamp'
  | 'malformed-json';

export type Provider = 'stripe' | 'github';

export interface CrashLabConfig {
  name?: string;
  /** Signing scheme. `stripe` (default): `Stripe-Signature: t=..,v1=..`. `github`: `X-Hub-Signature-256`. */
  provider?: Provider;
  target: Target;
  /** Webhook signing secret your handler verifies with (e.g. a test `whsec_...`). */
  secret: string;
  /** The event to deliver, e.g. `checkout.session.completed`. */
  event: WebhookEvent;
  adapter?: StateAdapter;
  expect?: {
    /** State after exactly ONE successful delivery of `event`. Keys you leave out are not tested. */
    once?: State;
  };
  /** Events in their real order; crash-lab delivers them reversed and checks `expected`. */
  sequence?: { events: WebhookEvent[]; expected: State };
  scenarios?: ScenarioId[];
  /** Parallel copies for duplicate-concurrent. Default 5. */
  concurrency?: number;
  /** Sequential copies for duplicate-sequential. Default 3. */
  duplicates?: number;
  /** Default `stripe-signature` (stripe) or `x-hub-signature-256` (github). */
  signatureHeader?: string;
  /** Age of the stale delivery in seconds. Default 600 (Stripe tolerance is 300). */
  staleSeconds?: number;
  /**
   * Per-delivery deadline in milliseconds. A delivery with no response by then fails the scenario,
   * and the request's `signal` is aborted. Default 10000.
   */
  timeoutMs?: number;
}

export type Status = 'pass' | 'fail' | 'not-tested';

export interface CheckResult {
  name: 'http status' | 'business state';
  status: Status;
  detail: string;
}

export interface ScenarioResult {
  id: ScenarioId;
  title: string;
  what: string;
  why: string;
  fix: string;
  status: Status;
  checks: CheckResult[];
  responses: number[];
  durationMs: number;
}

export interface CrashLabResult {
  name: string;
  startedAt: string;
  ok: boolean;
  summary: { pass: number; fail: number; notTested: number };
  scenarios: ScenarioResult[];
}
