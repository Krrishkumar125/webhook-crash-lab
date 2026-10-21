import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createExpressApp } from '../examples/express/app.js';
import { runCrashLab } from '../src/index.js';

describe('examples/express', () => {
  const { app, store } = createExpressApp('whsec_express');
  let server: Server;
  let url = '';
  beforeAll(async () => {
    server = await new Promise<Server>((ok) => {
      const s = app.listen(0, () => ok(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/stripe`;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

  it('passes every scenario against a real Express server', async () => {
    const r = await runCrashLab({
      target: url,
      secret: 'whsec_express',
      event: { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } },
      adapter: { reset: () => store.reset(), observe: () => store.snapshot() },
      expect: { once: { credits: 100 } },
    });
    expect(r.scenarios.filter((s) => s.status === 'fail')).toEqual([]);
  });
});
