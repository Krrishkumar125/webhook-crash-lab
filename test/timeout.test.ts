import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCrashLab } from '../src/index.js';

const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } };

describe('delivery timeout', () => {
  it('fails a handler function that never responds, and aborts its request signal', async () => {
    let aborted = false;
    const t0 = Date.now();
    const r = await runCrashLab({
      target: (req) =>
        new Promise<Response>(() => {
          req.signal.addEventListener('abort', () => (aborted = true));
        }),
      secret: 'whsec_x',
      event,
      scenarios: ['single-valid'],
      timeoutMs: 50,
    });
    expect(Date.now() - t0).toBeLessThan(2000);
    const s = r.scenarios[0]!;
    expect(s.status).toBe('fail');
    expect(s.checks[0]?.detail).toMatch(/did not respond within 50ms/);
    expect(aborted).toBe(true);
  });

  describe('against a slow HTTP server', () => {
    let server: Server;
    let url = '';
    beforeAll(async () => {
      server = createServer(() => {
        /* never respond */
      });
      await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    });
    afterAll(() => {
      server.closeAllConnections();
      server.close();
    });

    it('fails with a timeout instead of hanging', async () => {
      const r = await runCrashLab({
        target: url,
        secret: 'whsec_x',
        event,
        scenarios: ['single-valid'],
        timeoutMs: 100,
      });
      expect(r.scenarios[0]?.checks[0]?.detail).toMatch(/did not respond within 100ms/);
    });
  });

  it('rejects a non-positive timeout', async () => {
    await expect(
      runCrashLab({ target: () => new Response('ok'), secret: 's', event, timeoutMs: 0 }),
    ).rejects.toThrow(/timeoutMs/);
  });
});
