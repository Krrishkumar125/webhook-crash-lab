import { describe, expect, it } from 'vitest';
import { runCrashLab, verifyGithub } from '../src/index.js';

describe('provider: github', () => {
  it('signs with x-hub-signature-256 and reports stale-timestamp as not tested', async () => {
    const seen = new Set<string>();
    let applied = 0;
    const handler = async (req: Request) => {
      const raw = await req.text();
      if (!verifyGithub(raw, req.headers.get('x-hub-signature-256'), 'gh_secret'))
        return new Response('no', { status: 401 });
      try {
        const e = JSON.parse(raw) as { id: string };
        if (!seen.has(e.id)) {
          seen.add(e.id);
          applied++;
        }
      } catch {
        return new Response('bad', { status: 400 });
      }
      return new Response('ok');
    };
    const r = await runCrashLab({
      provider: 'github',
      target: handler,
      secret: 'gh_secret',
      event: { id: 'delivery-1', type: 'push' },
      adapter: {
        reset: () => (seen.clear(), (applied = 0), undefined),
        observe: () => ({ applied }),
      },
      expect: { once: { applied: 1 } },
    });
    const stale = r.scenarios.find((s) => s.id === 'stale-timestamp');
    expect(stale?.status).toBe('not-tested');
    expect(r.ok).toBe(true);
    expect(r.summary.fail).toBe(0);
  });
});
