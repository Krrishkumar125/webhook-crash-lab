import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { bullmqAdapter, combineAdapters } from '../src/adapters/bullmq.js';
import { createDemoApp, runCrashLab } from '../src/index.js';

const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const connection = new Redis(url, { maxRetriesPerRequest: null });

describe('BullMQ adapter (real Redis)', () => {
  const queues: Queue[] = [];
  afterAll(async () => {
    for (const q of queues) {
      await q.obliterate({ force: true });
      await q.close();
    }
    await connection.quit();
  });

  const setup = (mode: 'broken' | 'fixed') => {
    const queue = new Queue(`wcl-test-${mode}-${Date.now()}`, { connection });
    queues.push(queue);
    const demo = createDemoApp({
      mode,
      secret: 'whsec_bull',
      enqueue: (name, data, jobId) =>
        queue.add(name, data, jobId ? { jobId } : {}).then(() => undefined),
    });
    return {
      queue,
      config: {
        target: demo.handler,
        secret: 'whsec_bull',
        event: demo.events.grant,
        adapter: combineAdapters(demo.adapter, bullmqAdapter({ queue, key: 'receiptJobs' })),
        expect: { once: { credits: 100, ledgerEntries: 1, receiptJobs: 1 } },
        scenarios: ['single-valid', 'duplicate-sequential', 'duplicate-concurrent'] as const,
      },
    };
  };

  it('counts jobs in Redis and resets the queue between scenarios', async () => {
    const { queue } = setup('fixed');
    const adapter = bullmqAdapter({ queue });
    await queue.add('x', {});
    expect(await adapter.observe()).toEqual({ jobs: 1 });
    await adapter.reset();
    expect(await adapter.observe()).toEqual({ jobs: 0 });
  });

  it('flags a handler that enqueues a duplicate job on concurrent delivery', async () => {
    const { config } = setup('broken');
    const r = await runCrashLab({ ...config, scenarios: [...config.scenarios] });
    const c = r.scenarios.find((s) => s.id === 'duplicate-concurrent');
    expect(c?.status).toBe('fail');
    expect(c?.checks.find((x) => x.name === 'business state')?.detail).toMatch(/receiptJobs/);
  });

  it('passes a handler that uses jobId = event.id and an atomic claim', async () => {
    const { config } = setup('fixed');
    const r = await runCrashLab({ ...config, scenarios: [...config.scenarios] });
    expect(r.ok).toBe(true);
  });
});
