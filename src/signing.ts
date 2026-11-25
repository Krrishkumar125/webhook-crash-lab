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

/** GitHub-style `X-Hub-Signature-256` header: `sha256=<hex hmac-sha256 of the raw body>`. */
export function signGithub(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

/** Constant-time check of an `X-Hub-Signature-256` header. */
export function verifyGithub(
  payload: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const got = Buffer.from(header.slice(7), 'hex');
  const expected = Buffer.from(signGithub(payload, secret).slice(7), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const hexEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

/** Razorpay `X-Razorpay-Signature`: hex HMAC-SHA256 of the raw body, keyed with the webhook secret. */
export function signRazorpay(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time check of an `X-Razorpay-Signature` header. Razorpay signatures carry no timestamp. */
export function verifyRazorpay(
  payload: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  return !!header && hexEqual(header, signRazorpay(payload, secret));
}

/** Standard Webhooks key: the base64 part of a `whsec_...` secret, decoded. */
const standardKey = (secret: string): Buffer =>
  Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');

/**
 * Standard Webhooks (https://www.standardwebhooks.com) symmetric signature for the
 * `webhook-signature` header: `v1,<base64 HMAC-SHA256 of "msgId.timestamp.payload">`.
 */
export function signStandard(
  msgId: string,
  timestamp: number,
  payload: string,
  secret: string,
): string {
  const sig = createHmac('sha256', standardKey(secret))
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${sig}`;
}

export interface StandardHeaders {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
}

/**
 * Verify Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) in
 * constant time. The signature header may hold several space-separated `v1,...` entries during
 * secret rotation; any match passes. Timestamps outside the tolerance (default 300s) fail.
 */
export function verifyStandard(
  payload: string,
  headers: StandardHeaders,
  secret: string,
  { toleranceSeconds = 300, now = nowSeconds() }: VerifyOptions = {},
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  const t = Number(timestamp);
  if (toleranceSeconds > 0 && Math.abs(now - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signStandard(id, t, payload, secret).slice(3), 'base64');
  return signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',', 2);
    if (version !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
