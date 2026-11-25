import { describe, expect, it } from 'vitest';
import { runCrashLab, verifySignature, type StateAdapter } from '../src/index.js';

const SECRET = 'whsec_retry_test';
const event = { id: 'evt_pay_1', type: 'payment.captured', data: { amount: 500 } };

/** A payments handler with a fault hook. `style` decides how it records the event id. */
function app(style: 'save-first' | 'same-transaction' | 'ack-on-error') {
  const db = { processed: new Set<string>(), payments: 0, failNext: false };
  const writePayment = () => {
    if (db.failNext) {
      db.failNext = false;
      throw new Error('payment write failed');
    }
    db.payments++;
  };
  const handler = async (req: Request) => {
    const raw = await req.text();
    if (!verifySignature(raw, req.headers.get('stripe-signature'), SECRET))
      return new Response('bad', { status: 400 });
    const e = JSON.parse(raw) as { id: string };
    if (db.processed.has(e.id)) return new Response('duplicate');
    try {
      if (style === 'save-first') {
        db.processed.add(e.id);
        writePayment();
      } else {
        writePayment();
        db.processed.add(e.id); // committed together with the payment
      }
    } catch {
      return new Response(style === 'ack-on-error' ? 'ok' : 'retry', {
        status: style === 'ack-on-error' ? 200 : 500,
      });
    }
    return new Response('ok');
  };
  const adapter: StateAdapter = {
    reset: () => {
      db.processed.clear();
      db.payments = 0;
      db.failNext = false;
    },
    observe: () => ({ payments: db.payments }),
    failNextEffect: () => {
      db.failNext = true;
    },
  };
  return { handler, adapter };
}

const run = (style: Parameters<typeof app>[0], withHook = true) => {
  const a = app(style);
  const adapter = withHook ? a.adapter : { ...a.adapter, failNextEffect: undefined };
  return runCrashLab({
    target: a.handler,
    secret: SECRET,
    event,
    adapter,
    expect: { once: { payments: 1 } },
    scenarios: ['retry-after-failure'],
  });
};

describe('scenario: retry-after-failure', () => {
  it('fails a handler that saves the event id before the write: the retry is skipped', async () => {
    const [s] = (await run('save-first')).scenarios;
    expect(s?.status).toBe('fail');
    expect(s?.responses).toEqual([500, 200]);
    expect(s?.checks[1]?.detail).toMatch(/payments: expected 1, got 0/);
  });

  it('passes a handler that records the id with the write and returns 5xx on failure', async () => {
    const r = await run('same-transaction');
    expect(r.ok).toBe(true);
    expect(r.scenarios[0]?.checks[0]?.detail).toMatch(/Failed delivery returned 500/);
  });

  it('fails a handler that answers 2xx after the write failed, since the provider never retries', async () => {
    const [s] = (await run('ack-on-error')).scenarios;
    expect(s?.status).toBe('fail');
    expect(s?.checks[0]?.detail).toMatch(/returned 200\. A 2xx tells the provider/);
  });

  it('is not tested without adapter.failNextEffect', async () => {
    const [s] = (await run('save-first', false)).scenarios;
    expect(s?.status).toBe('not-tested');
    expect(s?.checks[1]?.detail).toMatch(/failNextEffect/);
  });
});
