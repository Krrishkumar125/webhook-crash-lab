import { verifySignature } from '../signing.js';
import type { CrashLabConfig, StateAdapter, WebhookEvent } from '../types.js';

export type DemoMode = 'broken' | 'fixed';
export type Enqueue = (name: string, data: unknown, jobId?: string) => Promise<void>;

export interface DemoOptions {
  mode: DemoMode;
  secret: string;
  /** Plug in a real queue (e.g. BullMQ). Without it, jobs are counted in memory. */
  enqueue?: Enqueue;
}

const tick = () => new Promise((r) => setTimeout(r, 5)); // simulates a DB round trip

/**
 * A tiny "AI credits" app: checkout.session.completed grants 100 credits, writes a ledger row and
 * enqueues a receipt email; charge.refunded takes the credits back. `broken` is what AI tools
 * commonly generate; `fixed` is the same app done right.
 */
export function createDemoApp({ mode, secret, enqueue }: DemoOptions) {
  const db = {
    credits: 0,
    ledger: [] as { event: string; delta: number }[],
    processed: new Set<string>(),
    granted: new Set<string>(),
    refunded: new Set<string>(),
    jobs: 0,
  };
  const addJob: Enqueue = enqueue ?? (async () => void db.jobs++);

  const apply = async (event: WebhookEvent) => {
    const session = (event.data as { object: { id: string } }).object.id;
    if (event.type === 'checkout.session.completed') {
      if (mode === 'fixed' && db.refunded.has(session)) return; // refund arrived first
      db.credits += 100;
      db.granted.add(session);
      db.ledger.push({ event: event.id, delta: 100 });
      await addJob('send-receipt', { session }, mode === 'fixed' ? event.id : undefined);
    }
    if (event.type === 'charge.refunded') {
      if (db.granted.has(session)) {
        db.credits -= 100;
        db.ledger.push({ event: event.id, delta: -100 });
      } else if (mode === 'fixed') {
        db.refunded.add(session);
      }
    }
  };

  const handler = async (req: Request): Promise<Response> => {
    const raw = await req.text();
    const header = req.headers.get('stripe-signature');
    if (mode === 'broken') {
      // Typical generated code: no null check, no timestamp tolerance, unguarded JSON.parse,
      // and "check then insert" dedupe with an await in between.
      const t = (header as string).split(',')[0]?.slice(2);
      if (!verifySignature(raw, header, secret, { toleranceSeconds: 0 }) || !t)
        return new Response('bad signature', { status: 400 });
      const event = JSON.parse(raw) as WebhookEvent;
      if (db.processed.has(event.id)) return new Response('ok');
      await tick();
      await apply(event);
      db.processed.add(event.id);
      return new Response('ok');
    }
    if (!verifySignature(raw, header, secret))
      return new Response('bad signature', { status: 400 });
    let event: WebhookEvent;
    try {
      event = JSON.parse(raw) as WebhookEvent;
    } catch {
      return new Response('invalid json', { status: 400 });
    }
    if (db.processed.has(event.id)) return new Response('duplicate');
    db.processed.add(event.id); // atomic claim before any await (like INSERT ... ON CONFLICT)
    await tick();
    await apply(event);
    return new Response('ok');
  };

  const adapter: StateAdapter = {
    reset() {
      db.credits = 0;
      db.jobs = 0;
      db.ledger.length = 0;
      for (const s of [db.processed, db.granted, db.refunded]) s.clear();
    },
    observe: () => ({
      credits: db.credits,
      ledgerEntries: db.ledger.length,
      ...(enqueue ? {} : { jobs: db.jobs }),
    }),
  };

  const obj = { object: { id: 'cs_test_1' } };
  const events = {
    grant: { id: 'evt_grant_1', type: 'checkout.session.completed', created: 1, data: obj },
    refund: { id: 'evt_refund_1', type: 'charge.refunded', created: 2, data: obj },
  } satisfies Record<string, WebhookEvent>;

  return { handler, adapter, events, db };
}

/** Ready-made crash-lab config for the demo app (used by `webhook-crash-lab demo`). */
export function demoConfig(mode: DemoMode): CrashLabConfig {
  const secret = 'whsec_demo_secret';
  const demo = createDemoApp({ mode, secret });
  return {
    name: `demo credits app (${mode})`,
    target: demo.handler,
    secret,
    event: demo.events.grant,
    adapter: demo.adapter,
    expect: { once: { credits: 100, ledgerEntries: 1, jobs: 1 } },
    sequence: { events: [demo.events.grant, demo.events.refund], expected: { credits: 0 } },
  };
}
