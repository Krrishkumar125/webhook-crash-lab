import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertNoCrashes,
  createDemoApp,
  demoConfig,
  runCrashLab,
  type CrashLabResult,
} from '../src/index.js';

const byId = (r: CrashLabResult, id: string) => {
  const s = r.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`missing scenario ${id}`);
  return s;
};

describe('runCrashLab against the bundled broken demo', () => {
  let result: CrashLabResult;
  beforeAll(async () => {
    result = await runCrashLab(demoConfig('broken'));
  });

  it('passes what the broken handler gets right', () => {
    expect(byId(result, 'single-valid').status).toBe('pass');
    expect(byId(result, 'duplicate-sequential').status).toBe('pass');
    expect(byId(result, 'invalid-signature').status).toBe('pass');
  });

  it('catches the concurrent duplicate that grants credits twice', () => {
    const s = byId(result, 'duplicate-concurrent');
    expect(s.status).toBe('fail');
    expect(s.checks.find((c) => c.name === 'business state')?.detail).toMatch(/credits/);
  });

  it('catches crashes on missing signature and malformed JSON, and accepted stale replays', () => {
    expect(byId(result, 'missing-signature').status).toBe('fail');
    expect(byId(result, 'missing-signature').checks[0]?.detail).toMatch(/500/);
    expect(byId(result, 'malformed-json').status).toBe('fail');
    expect(byId(result, 'stale-timestamp').status).toBe('fail');
  });

  it('catches the refund that arrived before the grant', () => {
    expect(byId(result, 'out-of-order').status).toBe('fail');
  });

  it('summarises and assertNoCrashes throws a readable error', () => {
    expect(result.ok).toBe(false);
    expect(result.summary.fail).toBe(5);
    expect(() => assertNoCrashes(result)).toThrow(/duplicate-concurrent/);
  });
});

describe('runCrashLab against the fixed demo', () => {
  it('passes every scenario', async () => {
    const result = await runCrashLab(demoConfig('fixed'));
    expect(result.scenarios.map((s) => [s.id, s.status])).toEqual(
      result.scenarios.map((s) => [s.id, 'pass']),
    );
    expect(result.ok).toBe(true);
    expect(() => assertNoCrashes(result)).not.toThrow();
  });
});

describe('unconfigured invariants', () => {
  it('reports "not-tested" instead of passing when no adapter or sequence is given', async () => {
    const demo = createDemoApp({ mode: 'fixed', secret: 's' });
    const result = await runCrashLab({
      target: demo.handler,
      secret: 's',
      event: demo.events.grant,
    });
    const single = byId(result, 'single-valid');
    expect(single.status).toBe('pass');
    expect(single.checks.find((c) => c.name === 'business state')?.status).toBe('not-tested');
    expect(byId(result, 'out-of-order').status).toBe('not-tested');
    expect(result.summary.notTested).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
  });

  it('runs only the selected scenarios', async () => {
    const result = await runCrashLab({ ...demoConfig('fixed'), scenarios: ['single-valid'] });
    expect(result.scenarios.map((s) => s.id)).toEqual(['single-valid']);
  });
});

describe('URL targets', () => {
  const demo = createDemoApp({ mode: 'fixed', secret: 'whsec_url' });
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await demo.handler(
      new Request(`http://x${req.url}`, {
        method: req.method,
        headers,
        body: Buffer.concat(chunks),
      }),
    );
    res.writeHead(r.status);
    res.end(await r.text());
  });
  let url = '';
  beforeAll(async () => {
    await new Promise<void>((ok) => server.listen(0, ok));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/stripe`;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

  it('posts real HTTP requests to a running server', async () => {
    const result = await runCrashLab({
      target: url,
      secret: 'whsec_url',
      event: demo.events.grant,
      adapter: demo.adapter,
      expect: { once: { credits: 100, ledgerEntries: 1, jobs: 1 } },
    });
    expect(result.ok).toBe(true);
  });

  it('fails clearly when the target is unreachable', async () => {
    const result = await runCrashLab({
      target: 'http://127.0.0.1:1/nope',
      secret: 's',
      event: demo.events.grant,
      scenarios: ['single-valid'],
    });
    expect(result.ok).toBe(false);
    expect(byId(result, 'single-valid').checks[0]?.detail).toMatch(/could not reach/i);
  });
});
