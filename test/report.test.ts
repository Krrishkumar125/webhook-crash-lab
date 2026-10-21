import { describe, expect, it } from 'vitest';
import { demoConfig, runCrashLab, toHtml, toJson, toText } from '../src/index.js';

describe('reports', async () => {
  const result = await runCrashLab({ ...demoConfig('broken'), name: '<script>x</script>' });

  it('text report lists each scenario with a verdict and a fix hint for failures', () => {
    const text = toText(result);
    expect(text).toMatch(/FAIL\s+duplicate-concurrent/);
    expect(text).toMatch(/PASS\s+single-valid/);
    expect(text).toMatch(/Fix:/);
  });

  it('JSON report round-trips and carries the summary', () => {
    const parsed = JSON.parse(toJson(result));
    expect(parsed.summary.fail).toBe(result.summary.fail);
    expect(parsed.scenarios).toHaveLength(result.scenarios.length);
  });

  it('HTML report is self-contained, escaped and plain English', () => {
    const html = toHtml(result);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toMatch(/granted twice|more than once/i);
  });
});
