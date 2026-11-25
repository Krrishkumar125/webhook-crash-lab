import { signGithub, signPayload, signRazorpay, signStandard } from './signing.js';
import type { Provider } from './types.js';

export interface SignInput {
  body: string;
  secret: string;
  eventId: string;
  timestamp: number;
}

export interface ProviderDef {
  /** Header that carries the signature (can be overridden with `signatureHeader`). */
  signatureHeader: string;
  /** Whether the scheme signs a timestamp, so a stale delivery can be tested. */
  timestamped: boolean;
  /** Every header a real delivery carries, signature included. */
  headers(input: SignInput): Record<string, string>;
  /** A secret of the right shape that is not the configured one, for forged deliveries. */
  wrongSecret(secret: string): string;
}

const suffixed = (secret: string) => `${secret}_wrong`;

export const PROVIDERS: Readonly<Record<Provider, ProviderDef>> = {
  stripe: {
    signatureHeader: 'stripe-signature',
    timestamped: true,
    headers: ({ body, secret, timestamp }) => ({
      'stripe-signature': signPayload(body, secret, timestamp),
    }),
    wrongSecret: suffixed,
  },
  github: {
    signatureHeader: 'x-hub-signature-256',
    timestamped: false,
    headers: ({ body, secret, eventId }) => ({
      'x-github-delivery': eventId,
      'x-hub-signature-256': signGithub(body, secret),
    }),
    wrongSecret: suffixed,
  },
  razorpay: {
    signatureHeader: 'x-razorpay-signature',
    timestamped: false,
    // Razorpay's docs say to dedupe on the x-razorpay-event-id header; the body has no event id.
    headers: ({ body, secret, eventId }) => ({
      'x-razorpay-event-id': eventId,
      'x-razorpay-signature': signRazorpay(body, secret),
    }),
    wrongSecret: suffixed,
  },
  standard: {
    signatureHeader: 'webhook-signature',
    timestamped: true,
    headers: ({ body, secret, eventId, timestamp }) => ({
      'webhook-id': eventId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': signStandard(eventId, timestamp, body, secret),
    }),
    wrongSecret: () =>
      `whsec_${Buffer.from('webhook-crash-lab forged key 0001').toString('base64')}`,
  },
};

export const providerOf = (provider: Provider | undefined): ProviderDef => {
  const def = PROVIDERS[provider ?? 'stripe'];
  if (!def)
    throw new Error(
      `Unknown provider "${provider}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  return def;
};
