import { isDeepStrictEqual } from 'node:util';
import { SCENARIOS, type ScenarioDef } from './scenarios.js';
import { nowSeconds, signPayload } from './signing.js';
import type {
  CheckResult,
  CrashLabConfig,
  CrashLabResult,
  ScenarioResult,
  State,
  Status,
  WebhookEvent,
} from './types.js';

type SignMode = 'valid' | 'invalid' | 'missing' | 'stale';

async function deliver(config: CrashLabConfig, body: string, mode: SignMode): Promise<number> {
  const headers = new Headers({ 'content-type': 'application/json' });
  const header = config.signatureHeader ?? 'stripe-signature';
  if (mode === 'valid') headers.set(header, signPayload(body, config.secret));
  if (mode === 'invalid') headers.set(header, signPayload(body, `${config.secret}_wrong`));
  if (mode === 'stale')
    headers.set(
      header,
      signPayload(body, config.secret, nowSeconds() - (config.staleSeconds ?? 600)),
    );
  const url = typeof config.target === 'string' ? config.target : 'http://crash-lab.local/webhook';
  const req = new Request(url, { method: 'POST', headers, body });
  try {
    const res = typeof config.target === 'string' ? await fetch(req) : await config.target(req);
    await res.arrayBuffer().catch(() => undefined);
    return res.status;
  } catch {
    // A thrown handler is what a framework would turn into a 500; an unreachable URL is 0.
    return typeof config.target === 'string' ? 0 : 500;
  }
}

const pick = (state: State, keys: string[]): State =>
  Object.fromEntries(keys.map((k) => [k, state[k]]));

function diff(expected: State, actual: State): string {
  return Object.keys(expected)
    .filter((k) => !isDeepStrictEqual(expected[k], actual[k]))
    .map((k) => `${k}: expected ${JSON.stringify(expected[k])}, got ${JSON.stringify(actual[k])}`)
    .join('; ');
}

function statusCheck(def: ScenarioDef, codes: number[]): CheckResult {
  const name = 'http status';
  if (codes.includes(0))
    return { name, status: 'fail', detail: 'Could not reach the target URL (connection failed).' };
  const crashed = codes.filter((c) => c >= 500);
  if (crashed.length)
    return {
      name,
      status: 'fail',
      detail: `Handler crashed with ${crashed[0]} (${crashed.length}/${codes.length} requests).`,
    };
  if (def.expectation === 'accept-once') {
    const bad = codes.filter((c) => c < 200 || c >= 300);
    return bad.length
      ? {
          name,
          status: 'fail',
          detail: `Expected 2xx for every delivery, got ${codes.join(', ')}.`,
        }
      : { name, status: 'pass', detail: `All ${codes.length} deliveries returned 2xx.` };
  }
  if (def.expectation === 'reject') {
    const c = codes[0] as number;
    return c >= 400 && c < 500
      ? { name, status: 'pass', detail: `Rejected with ${c}.` }
      : {
          name,
          status: 'fail',
          detail: `Expected a 4xx rejection, got ${c} (the event was accepted).`,
        };
  }
  return { name, status: 'pass', detail: `Responses: ${codes.join(', ')} (no crashes).` };
}

async function observe(config: CrashLabConfig): Promise<State> {
  await config.adapter?.settle?.();
  return (await config.adapter?.observe()) ?? {};
}

async function runScenario(def: ScenarioDef, config: CrashLabConfig): Promise<ScenarioResult> {
  const started = Date.now();
  const adapter = config.adapter;
  const once = config.expect?.once;
  const body = JSON.stringify(config.event);
  let codes: number[] = [];
  let state: CheckResult;

  if (def.expectation === 'sequence' && !config.sequence) {
    return finish(
      def,
      started,
      [],
      [
        { name: 'http status', status: 'not-tested', detail: 'No `sequence` configured.' },
        {
          name: 'business state',
          status: 'not-tested',
          detail: 'Add `sequence: { events, expected }` to test ordering.',
        },
      ],
    );
  }

  await adapter?.reset();
  const baseline = await observe(config);

  if (def.id === 'single-valid') codes = [await deliver(config, body, 'valid')];
  if (def.id === 'duplicate-sequential')
    for (let i = 0; i < (config.duplicates ?? 3); i++)
      codes.push(await deliver(config, body, 'valid'));
  if (def.id === 'duplicate-concurrent')
    codes = await Promise.all(
      Array.from({ length: config.concurrency ?? 5 }, () => deliver(config, body, 'valid')),
    );
  if (def.id === 'invalid-signature') codes = [await deliver(config, body, 'invalid')];
  if (def.id === 'missing-signature') codes = [await deliver(config, body, 'missing')];
  if (def.id === 'stale-timestamp') codes = [await deliver(config, body, 'stale')];
  if (def.id === 'malformed-json') codes = [await deliver(config, body.slice(0, -3), 'valid')];
  if (def.id === 'out-of-order')
    for (const e of [...(config.sequence?.events as WebhookEvent[])].reverse())
      codes.push(await deliver(config, JSON.stringify(e), 'valid'));

  const after = await observe(config);
  const name = 'business state';
  if (!adapter) {
    state = {
      name,
      status: 'not-tested',
      detail: 'No adapter configured, so business state was not checked.',
    };
  } else if (def.expectation === 'sequence') {
    const d = diff(config.sequence?.expected as State, after);
    state = d
      ? { name, status: 'fail', detail: `Final state is wrong after out-of-order delivery: ${d}.` }
      : { name, status: 'pass', detail: 'Final state matches the expected outcome.' };
  } else if (def.expectation === 'accept-once') {
    if (!once) {
      state = { name, status: 'not-tested', detail: 'No `expect.once` configured.' };
    } else {
      const d = diff(once, after);
      state = d
        ? {
            name,
            status: 'fail',
            detail: `The effect was applied more than once or not at all: ${d}.`,
          }
        : {
            name,
            status: 'pass',
            detail: `Applied exactly once (${JSON.stringify(pick(after, Object.keys(once)))}).`,
          };
    }
  } else {
    const keys = once ? Object.keys(once) : Object.keys(baseline);
    const d = diff(pick(baseline, keys), after);
    state = d
      ? { name, status: 'fail', detail: `A rejected delivery still changed state: ${d}.` }
      : { name, status: 'pass', detail: 'State unchanged.' };
  }
  return finish(def, started, codes, [statusCheck(def, codes), state]);
}

function finish(
  def: ScenarioDef,
  started: number,
  codes: number[],
  checks: CheckResult[],
): ScenarioResult {
  const statuses = checks.map((c) => c.status);
  const status: Status = statuses.includes('fail')
    ? 'fail'
    : statuses.every((s) => s === 'not-tested')
      ? 'not-tested'
      : 'pass';
  return {
    id: def.id,
    title: def.title,
    what: def.what,
    why: def.why,
    fix: def.fix,
    status,
    checks,
    responses: codes,
    durationMs: Date.now() - started,
  };
}

/** Run every (or the selected) crash scenario against your handler, one at a time. */
export async function runCrashLab(config: CrashLabConfig): Promise<CrashLabResult> {
  const startedAt = new Date().toISOString();
  const defs = SCENARIOS.filter((s) => !config.scenarios || config.scenarios.includes(s.id));
  const scenarios: ScenarioResult[] = [];
  for (const def of defs) scenarios.push(await runScenario(def, config));
  const count = (s: Status) => scenarios.filter((x) => x.status === s).length;
  const summary = { pass: count('pass'), fail: count('fail'), notTested: count('not-tested') };
  return {
    name: config.name ?? config.event.type,
    startedAt,
    ok: summary.fail === 0,
    summary,
    scenarios,
  };
}
