import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { findConfig, loadConfig } from '../src/config.js';

const src = pathToFileURL(join(process.cwd(), 'src/index.ts')).href;
const quiet = { log: () => {}, error: () => {} };

describe('loadConfig', () => {
  it('loads a TypeScript config with types, interfaces and satisfies', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-ts-'));
    const file = join(dir, 'crash-lab.config.ts');
    writeFileSync(
      file,
      `import { demoConfig, type CrashLabConfig } from '${src}';
       interface Extra { note: string }
       const extra: Extra = { note: 'typed' };
       export default { ...demoConfig('fixed'), name: extra.note } satisfies CrashLabConfig;\n`,
    );
    const config = await loadConfig(file);
    expect(config.name).toBe('typed');
    expect(await main(['run', file, '--quiet'], quiet)).toBe(0);
  });

  it('loads .mts and .cts configs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-ts-'));
    writeFileSync(
      join(dir, 'a.mts'),
      `import { demoConfig } from '${src}';\nexport default demoConfig('broken');\n`,
    );
    expect((await loadConfig(join(dir, 'a.mts'))).name).toMatch(/broken/);
    writeFileSync(
      join(dir, 'b.cts'),
      `const lab = require(${JSON.stringify(join(process.cwd(), 'src/index.ts'))});\nmodule.exports = lab.demoConfig('fixed');\n`,
    );
    expect((await loadConfig(join(dir, 'b.cts'))).name).toMatch(/fixed/);
  });

  it('picks up edits on reload (no stale module cache)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-ts-'));
    const file = join(dir, 'c.config.ts');
    const write = (name: string) =>
      writeFileSync(
        file,
        `import { demoConfig } from '${src}';\nexport default { ...demoConfig('fixed'), name: '${name}' };\n`,
      );
    write('one');
    expect((await loadConfig(file)).name).toBe('one');
    write('two');
    expect((await loadConfig(file)).name).toBe('two');
  });

  it('init writes a starter that also loads as a .ts config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-init-ts-'));
    const file = join(dir, 'crash-lab.config.ts');
    expect(await main(['init', file], quiet)).toBe(0);
    // the starter imports 'webhook-crash-lab'; resolve it to this checkout for the test
    const { readFileSync } = await import('node:fs');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace("from 'webhook-crash-lab'", `from '${src}'`),
    );
    const config = await loadConfig(file);
    expect(config.event.type).toBe('checkout.session.completed');
  });

  const native = (process as { features?: { typescript?: unknown } }).features?.typescript;
  it.runIf(native)(
    'loads a .ts config with Node type stripping when jiti is not used',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'wcl-native-'));
      const file = join(dir, 'n.config.ts');
      writeFileSync(
        file,
        `import { demoConfig } from '${src}';\nconst c: { name: string } = { name: 'native' };\nexport default { ...demoConfig('fixed'), ...c };\n`,
      );
      expect((await loadConfig(file, undefined, { typescript: 'native' })).name).toBe('native');
    },
  );

  it.skipIf(native)(
    'explains how to load .ts configs when type stripping is unavailable',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'wcl-native-'));
      const file = join(dir, 'n.config.ts');
      writeFileSync(file, 'const x: number = 1;\nexport default x;\n');
      await expect(loadConfig(file, undefined, { typescript: 'native' })).rejects.toThrow(
        /npm i -D jiti/,
      );
    },
  );

  it('gives clear errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-ts-'));
    await expect(loadConfig(join(dir, 'missing.ts'))).rejects.toThrow(/Config not found/);
    writeFileSync(join(dir, 'bad.ts'), 'export default { secret: 1 };\n');
    await expect(loadConfig(join(dir, 'bad.ts'))).rejects.toThrow(
      /export default \{ target, secret, event \}/,
    );
  });

  it('finds the default config file in order mjs, js, ts, mts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-find-'));
    expect(findConfig(dir)).toBeUndefined();
    writeFileSync(join(dir, 'crash-lab.config.ts'), '');
    expect(findConfig(dir)).toBe(join(dir, 'crash-lab.config.ts'));
    writeFileSync(join(dir, 'crash-lab.config.mjs'), '');
    expect(findConfig(dir)).toBe(join(dir, 'crash-lab.config.mjs'));
  });
});
