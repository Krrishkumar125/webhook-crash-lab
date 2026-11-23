// Hono + Stripe webhook handler done right. Run the crash lab against it:
//   npm run build && npx webhook-crash-lab run examples/hono/crash-lab.config.mjs
import { Hono } from 'hono';
import { verifySignature } from 'webhook-crash-lab';

export function createHonoApp(secret: string) {
  const state = { credits: 0, processed: new Set<string>() };
  const store = {
    reset: () => {
      state.credits = 0;
      state.processed.clear();
    },
    snapshot: () => ({ credits: state.credits }),
  };
  const app = new Hono();
  app.post('/webhooks/stripe', async (c) => {
    // Raw body: signatures are computed over the exact bytes, so read the text before
    // anything else. c.req.json() would consume the body and lose the bytes you must verify.
    const raw = await c.req.text();
    // In production prefer stripe.webhooks.constructEvent(raw, header, secret).
    if (!verifySignature(raw, c.req.header('stripe-signature'), secret))
      return c.text('bad signature', 400);
    let event: { id: string; type: string };
    try {
      event = JSON.parse(raw) as { id: string; type: string };
    } catch {
      return c.text('invalid json', 400);
    }
    // Atomic claim. With a database use INSERT ... ON CONFLICT DO NOTHING on event.id.
    if (state.processed.has(event.id)) return c.text('duplicate');
    state.processed.add(event.id);
    if (event.type === 'checkout.session.completed') state.credits += 100;
    return c.text('ok');
  });
  return { app, store };
}
