import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from '../src/index.js';

const secret = 'whsec_test_secret';
const payload = JSON.stringify({
  id: 'evt_1',
  object: 'event',
  type: 'checkout.session.completed',
});

describe('signPayload', () => {
  it('produces a t=,v1= header that the official stripe library accepts', () => {
    const header = signPayload(payload, secret);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    const stripe = new Stripe('sk_test_x');
    const event = stripe.webhooks.constructEvent(payload, header, secret);
    expect(event.id).toBe('evt_1');
  });

  it('uses the given timestamp so stale deliveries are rejected by stripe', () => {
    const header = signPayload(payload, secret, Math.floor(Date.now() / 1000) - 3600);
    const stripe = new Stripe('sk_test_x');
    expect(() => stripe.webhooks.constructEvent(payload, header, secret)).toThrow(/tolerance/i);
  });
});

describe('verifySignature', () => {
  it('accepts a fresh valid signature', () => {
    expect(verifySignature(payload, signPayload(payload, secret), secret)).toBe(true);
  });
  it('rejects wrong secret, missing or garbage headers, tampered body and stale timestamps', () => {
    expect(verifySignature(payload, signPayload(payload, 'other'), secret)).toBe(false);
    expect(verifySignature(payload, null, secret)).toBe(false);
    expect(verifySignature(payload, 'nonsense', secret)).toBe(false);
    expect(verifySignature(payload, 't=1,v1=zz', secret)).toBe(false);
    expect(verifySignature(payload + ' ', signPayload(payload, secret), secret)).toBe(false);
    const old = signPayload(payload, secret, Math.floor(Date.now() / 1000) - 301);
    expect(verifySignature(payload, old, secret)).toBe(false);
    expect(verifySignature(payload, old, secret, { toleranceSeconds: 0 })).toBe(true);
  });
});
