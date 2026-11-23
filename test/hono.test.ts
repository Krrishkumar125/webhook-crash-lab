import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHonoApp } from '../examples/hono/app.js';
import { runCrashLab } from '../src/index.js';

describe('examples/hono', () => {
  const { app, store } = createHonoApp('whsec_hono');
  let server: Server;
  let url = '';
  beforeAll(async () => {
    server = await new Promise<Server>((ok) => {
      const s = serve({ fetch: app.fetch, port: 0 }, () => ok(s as Server));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/stripe`;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

  it('passes every scenario against a real Hono server', async () => {
    const r = await runCrashLab({
      target: url,
      secret: 'whsec_hono',
      event: { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } },
      adapter: { reset: () => store.reset(), observe: () => store.snapshot() },
      expect: { once: { credits: 100 } },
    });
    expect(r.scenarios.filter((s) => s.status === 'fail')).toEqual([]);
    expect(r.summary.fail).toBe(0);
  });
});
