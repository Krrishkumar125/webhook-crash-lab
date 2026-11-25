import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  runCrashLab,
  signRazorpay,
  signStandard,
  verifyRazorpay,
  verifyStandard,
  type CrashLabConfig,
} from '../src/index.js';

describe('Standard Webhooks signatures', () => {
  // Known-answer vector used by the Standard Webhooks reference libraries.
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
  const ts = 1614265330;
  const payload = '{"test": 2432232314}';

  it('matches the reference signature', () => {
    expect(signStandard(id, ts, payload, secret)).toBe(
      'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    );
  });

  it('verifies, including one of several space-separated signatures', () => {
    const sig = signStandard(id, ts, payload, secret);
    const h = (signature: string, timestamp = String(ts)) => ({ id, timestamp, signature });
    expect(verifyStandard(payload, h(sig), secret, { now: ts })).toBe(true);
    expect(verifyStandard(payload, h(`v1,AAAA ${sig}`), secret, { now: ts })).toBe(true);
    expect(verifyStandard(payload, h(sig), secret, { now: ts + 301 })).toBe(false);
    expect(verifyStandard(payload, h(sig.replace('v1,', 'v2,')), secret, { now: ts })).toBe(false);
    expect(verifyStandard(`${payload} `, h(sig), secret, { now: ts })).toBe(false);
    expect(verifyStandard(payload, h(sig, 'abc'), secret, { now: ts })).toBe(false);
    expect(
      verifyStandard(payload, { id: null, timestamp: String(ts), signature: sig }, secret),
    ).toBe(false);
  });
});

describe('Razorpay signatures', () => {
  it('is a hex HMAC-SHA256 of the raw body', () => {
    const body = '{"event":"payment.captured"}';
    const expected = createHmac('sha256', 'rzp_secret').update(body).digest('hex');
    expect(signRazorpay(body, 'rzp_secret')).toBe(expected);
    expect(verifyRazorpay(body, expected, 'rzp_secret')).toBe(true);
    expect(verifyRazorpay(body, expected, 'other')).toBe(false);
    expect(verifyRazorpay(body, 'zz', 'rzp_secret')).toBe(false);
    expect(verifyRazorpay(body, null, 'rzp_secret')).toBe(false);
  });
});

/** A correct handler for any scheme, deduping on the id the provider says to use. */
function correctHandler(
  verify: (raw: string, h: Headers) => boolean,
  idOf: (raw: string, h: Headers) => string,
) {
  const seen = new Set<string>();
  let applied = 0;
  const handler = async (req: Request) => {
    const raw = await req.text();
    if (!verify(raw, req.headers)) return new Response('no', { status: 401 });
    try {
      JSON.parse(raw);
    } catch {
      return new Response('bad', { status: 400 });
    }
    const id = idOf(raw, req.headers);
    if (!seen.has(id)) {
      seen.add(id);
      applied++;
    }
    return new Response('ok');
  };
  const adapter = {
    reset: () => (seen.clear(), (applied = 0), undefined),
    observe: () => ({ applied }),
  };
  return { handler, adapter };
}

const base = (
  c: Pick<CrashLabConfig, 'provider' | 'secret' | 'target' | 'adapter'>,
): CrashLabConfig => ({
  ...c,
  event: { id: 'evt_1', type: 'payment.captured' },
  expect: { once: { applied: 1 } },
});

describe('provider: razorpay', () => {
  it('sends x-razorpay-signature and x-razorpay-event-id; stale is not tested', async () => {
    const { handler, adapter } = correctHandler(
      (raw, h) => verifyRazorpay(raw, h.get('x-razorpay-signature'), 'rzp'),
      (_raw, h) => h.get('x-razorpay-event-id') as string,
    );
    const r = await runCrashLab(
      base({ provider: 'razorpay', secret: 'rzp', target: handler, adapter }),
    );
    expect(r.summary.fail).toBe(0);
    expect(r.scenarios.find((s) => s.id === 'stale-timestamp')?.status).toBe('not-tested');
    expect(r.scenarios.find((s) => s.id === 'stale-timestamp')?.checks[0]?.detail).toMatch(
      /razorpay/,
    );
    expect(r.scenarios.find((s) => s.id === 'invalid-signature')?.status).toBe('pass');
  });
});

describe('provider: standard', () => {
  const secret = `whsec_${Buffer.from('a-test-key-of-at-least-24-bytes!').toString('base64')}`;
  it('sends webhook-id, webhook-timestamp and webhook-signature and tests stale timestamps', async () => {
    const { handler, adapter } = correctHandler(
      (raw, h) =>
        verifyStandard(
          raw,
          {
            id: h.get('webhook-id'),
            timestamp: h.get('webhook-timestamp'),
            signature: h.get('webhook-signature'),
          },
          secret,
        ),
      (_raw, h) => h.get('webhook-id') as string,
    );
    const r = await runCrashLab(base({ provider: 'standard', secret, target: handler, adapter }));
    expect(r.summary.fail).toBe(0);
    for (const id of ['stale-timestamp', 'invalid-signature', 'missing-signature'])
      expect(r.scenarios.find((s) => s.id === id)?.status).toBe('pass');
  });

  it('catches a handler that skips the timestamp check', async () => {
    const { handler, adapter } = correctHandler(
      (raw, h) =>
        verifyStandard(
          raw,
          {
            id: h.get('webhook-id'),
            timestamp: h.get('webhook-timestamp'),
            signature: h.get('webhook-signature'),
          },
          secret,
          { toleranceSeconds: 0 },
        ),
      (_raw, h) => h.get('webhook-id') as string,
    );
    const r = await runCrashLab(base({ provider: 'standard', secret, target: handler, adapter }));
    expect(r.scenarios.find((s) => s.id === 'stale-timestamp')?.status).toBe('fail');
  });
});

describe('unknown provider', () => {
  it('throws a clear error', async () => {
    await expect(
      runCrashLab({
        ...base({ secret: 's', target: () => new Response('ok') }),
        provider: 'paypal' as never,
      }),
    ).rejects.toThrow(/Unknown provider "paypal"/);
  });
});
