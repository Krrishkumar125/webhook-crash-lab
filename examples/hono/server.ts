// Start the example server, then point crash-lab at it:
//   npx tsx examples/hono/server.ts
//   npx webhook-crash-lab run examples/hono/crash-lab.config.mjs
import { serve } from '@hono/node-server';
import { createHonoApp } from './app.js';

const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_hono_example';
const port = Number(process.env.PORT ?? 3001);
const { app, store } = createHonoApp(secret);

// Inspection endpoints for crash-lab's HTTP adapter. A real app would expose the numbers it
// asserts on through its own test helpers instead; these two exist so this text-free demo can.
app.get('/crash-lab/state', (c) => c.json(store.snapshot()));
app.post('/crash-lab/reset', (c) => {
  store.reset();
  return c.text('ok');
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Hono webhook example listening on http://localhost:${info.port}/webhooks/stripe`);
});
