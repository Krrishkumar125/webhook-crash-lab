import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { log: (s: string) => out.push(s), error: (s: string) => err.push(s) } };
};

describe('cli', () => {
  it('prints help and version', async () => {
    const a = io();
    expect(await main(['--help'], a.io)).toBe(0);
    expect(a.out.join('\n')).toMatch(/Usage/);
    const b = io();
    expect(await main(['--version'], b.io)).toBe(0);
    expect(b.out[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('demo runs broken then fixed and writes reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-'));
    const a = io();
    expect(
      await main(['demo', '--html', join(dir, 'r.html'), '--json', join(dir, 'r.json')], a.io),
    ).toBe(0);
    const out = a.out.join('\n');
    expect(out).toMatch(/broken/i);
    expect(out).toMatch(/fixed/i);
    expect(readFileSync(join(dir, 'r.html'), 'utf8')).toContain('<!doctype html>');
    expect(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).ok).toBe(true);
  });

  it('demo --mode broken exits 1', async () => {
    expect(await main(['demo', '--mode', 'broken'], io().io)).toBe(1);
  });

  it('run loads a config file and exits 1 on failures, 0 on success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-'));
    const src = pathToFileURL(join(process.cwd(), 'src/index.ts')).href;
    for (const mode of ['broken', 'fixed']) {
      writeFileSync(
        join(dir, `${mode}.config.mjs`),
        `import { demoConfig } from '${src}';\nexport default demoConfig('${mode}');\n`,
      );
    }
    expect(await main(['run', join(dir, 'broken.config.mjs')], io().io)).toBe(1);
    expect(await main(['run', join(dir, 'fixed.config.mjs'), '--quiet'], io().io)).toBe(0);
  });

  it('exits 2 on a missing or invalid config and unknown commands', async () => {
    const a = io();
    expect(await main(['run', '/nope/config.mjs'], a.io)).toBe(2);
    expect(a.err.join('\n')).toMatch(/config/i);
    const dir = mkdtempSync(join(tmpdir(), 'wcl-'));
    writeFileSync(join(dir, 'bad.mjs'), 'export default { secret: 1 };');
    expect(await main(['run', join(dir, 'bad.mjs')], io().io)).toBe(2);
    expect(await main(['frobnicate'], io().io)).toBe(2);
  });
});
