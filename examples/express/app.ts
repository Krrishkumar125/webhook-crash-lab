// Express + Stripe webhook handler done right. Run the crash lab against it:
//   npx webhook-crash-lab run examples/express/crash-lab.config.mjs
import express from 'express';
import { verifySignature } from 'webhook-crash-lab';

export function createExpressApp(secret: string) {
  const state = { credits: 0, processed: new Set<string>() };
  const store = {
    reset: () => {
      state.credits = 0;
      state.processed.clear();
    },
    snapshot: () => ({ credits: state.credits }),
  };
  const app = express();
  // Raw body: signatures are computed over the exact bytes, so never JSON-parse first.
  app.post('/webhooks/stripe', express.raw({ type: '*/*' }), (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    // In production prefer stripe.webhooks.constructEvent(raw, header, secret).
    if (!verifySignature(raw, req.header('stripe-signature'), secret))
      return void res.status(400).send('bad signature');
    let event: { id: string; type: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return void res.status(400).send('invalid json');
    }
    // Atomic claim. With a database use INSERT ... ON CONFLICT DO NOTHING on event.id.
    if (state.processed.has(event.id)) return void res.send('duplicate');
    state.processed.add(event.id);
    if (event.type === 'checkout.session.completed') state.credits += 100;
    res.send('ok');
  });
  return { app, store };
}
