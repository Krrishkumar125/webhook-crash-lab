import { createHmac, timingSafeEqual } from 'node:crypto';

/** Seconds since the epoch. */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Build a Stripe-compatible `Stripe-Signature` header: `t=<ts>,v1=<hex hmac-sha256>`. */
export function signPayload(
  payload: string,
  secret: string,
  timestamp: number = nowSeconds(),
): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

export interface VerifyOptions {
  /** Max age in seconds. 0 disables the check. Default 300 (Stripe's default). */
  toleranceSeconds?: number;
  now?: number;
}

/** Verify a Stripe-style signature header in constant time, including timestamp tolerance. */
export function verifySignature(
  payload: string,
  header: string | null | undefined,
  secret: string,
  { toleranceSeconds = 300, now = nowSeconds() }: VerifyOptions = {},
): boolean {
  if (!header) return false;
  const parts = new Map<string, string[]>();
  for (const item of header.split(',')) {
    const [k, v] = item.split('=', 2);
    if (k && v) parts.set(k, [...(parts.get(k) ?? []), v]);
  }
  const t = Number(parts.get('t')?.[0]);
  const sigs = parts.get('v1') ?? [];
  if (!Number.isFinite(t) || sigs.length === 0) return false;
  if (toleranceSeconds > 0 && Math.abs(now - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(payload, secret, t).split('v1=')[1] as string, 'hex');
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
