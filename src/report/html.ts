import type { CrashLabResult, Status } from '../types.js';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

const BADGE: Record<Status, [string, string]> = {
  pass: ['Passed', '#0a7d32'],
  fail: ['Failed', '#c62828'],
  'not-tested': ['Not tested', '#6b7280'],
};

/** A self-contained, plain-English HTML report you can open or attach to a CI run. */
export function toHtml(result: CrashLabResult): string {
  const { pass, fail, notTested } = result.summary;
  const rows = result.scenarios
    .map((s) => {
      const [label, color] = BADGE[s.status];
      const checks = s.checks
        .map(
          (c) =>
            `<li><b>${esc(c.name)}:</b> ${esc(BADGE[c.status][0])} &mdash; ${esc(c.detail)}</li>`,
        )
        .join('');
      const fix = s.status === 'fail' ? `<p><b>How to fix:</b> ${esc(s.fix)}</p>` : '';
      return `<section><h2><span class="b" style="background:${color}">${label}</span> ${esc(s.title)} <code>${esc(s.id)}</code></h2>
<p>${esc(s.what)}</p><p><b>Why it matters:</b> ${esc(s.why)}</p><ul>${checks}</ul>${fix}</section>`;
    })
    .join('\n');
  const headline = fail
    ? `${fail} problem${fail === 1 ? '' : 's'} found. Your endpoint may return 200 while doing the wrong thing.`
    : 'No problems found in the scenarios that were tested.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>webhook-crash-lab: ${esc(result.name)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#111}
section{border:1px solid #e5e7eb;border-radius:8px;padding:.5rem 1rem;margin:1rem 0}
.b{color:#fff;border-radius:4px;padding:2px 8px;font-size:.8em}code{color:#555;font-size:.8em}</style></head>
<body><h1>webhook-crash-lab report</h1><p><b>${esc(result.name)}</b> &middot; ${esc(result.startedAt)}</p>
<p><b>${esc(headline)}</b></p><p>${pass} passed &middot; ${fail} failed &middot; ${notTested} not tested.
"Not tested" means you did not configure that check, not that it passed.</p>
${rows}
</body></html>
`;
}
