// Start the example server first (npx tsx examples/hono/server.ts), then run:
//   npm run build && npx webhook-crash-lab run examples/hono/crash-lab.config.mjs
const base = process.env.HONO_EXAMPLE_URL ?? 'http://localhost:3001';

export default {
  target: `${base}/webhooks/stripe`,
  secret: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_hono_example',
  event: {
    id: 'evt_hono_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_hono_1' } },
  },
  // The example server exposes the two inspection routes below. In your own app, call your
  // test database here instead (see examples/nextjs-prisma/README.md).
  adapter: {
    reset: async () => {
      await fetch(`${base}/crash-lab/reset`, { method: 'POST' });
    },
    observe: async () => (await fetch(`${base}/crash-lab/state`)).json(),
  },
  expect: { once: { credits: 100 } },
};
