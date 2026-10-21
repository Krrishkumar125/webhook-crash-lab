import type { JobType, Queue } from 'bullmq';
import type { State, StateAdapter } from '../types.js';

export interface BullmqAdapterOptions {
  queue: Queue;
  /** Key in the observed state. Default `jobs`. */
  key?: string;
  /** Job states to count. Default: everything a duplicate could land in. */
  states?: JobType[];
}

const ALL: JobType[] = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
  'completed',
  'failed',
];

/**
 * Count jobs on a BullMQ queue so crash-lab can assert "one webhook = one job".
 * `reset()` obliterates the queue, so point it at a test queue/Redis only.
 */
export function bullmqAdapter({
  queue,
  key = 'jobs',
  states = ALL,
}: BullmqAdapterOptions): StateAdapter {
  return {
    reset: () => queue.obliterate({ force: true }),
    observe: async () => ({ [key]: await queue.getJobCountByTypes(...states) }),
  };
}

/** Merge several adapters (e.g. your DB + a BullMQ queue) into one. */
export function combineAdapters(...adapters: StateAdapter[]): StateAdapter {
  return {
    reset: async () => {
      for (const a of adapters) await a.reset();
    },
    settle: async () => {
      for (const a of adapters) await a.settle?.();
    },
    observe: async () => {
      const out: State = {};
      for (const a of adapters) Object.assign(out, await a.observe());
      return out;
    },
  };
}
