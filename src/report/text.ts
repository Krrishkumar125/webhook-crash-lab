import type { CrashLabResult } from '../types.js';

const LABEL = { pass: 'PASS', fail: 'FAIL', 'not-tested': 'SKIP' } as const;

export function toText(result: CrashLabResult): string {
  const lines = [`webhook-crash-lab: ${result.name}`, ''];
  for (const s of result.scenarios) {
    lines.push(`  ${LABEL[s.status]}  ${s.id.padEnd(22)} ${s.title}`);
    for (const c of s.checks) if (c.status !== 'pass') lines.push(`        ${c.name}: ${c.detail}`);
    if (s.status === 'fail') lines.push(`        Why: ${s.why}`, `        Fix: ${s.fix}`);
  }
  const { pass, fail, notTested } = result.summary;
  lines.push('', `  ${pass} passed, ${fail} failed, ${notTested} not tested`);
  return lines.join('\n');
}

export const toJson = (result: CrashLabResult): string => JSON.stringify(result, null, 2);
