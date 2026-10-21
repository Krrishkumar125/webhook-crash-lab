import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CrashLabConfig } from './types.js';

/** Default config file names, in lookup order. */
export const CONFIG_FILES = [
  'crash-lab.config.mjs',
  'crash-lab.config.js',
  'crash-lab.config.ts',
  'crash-lab.config.mts',
  'crash-lab.config.cjs',
  'crash-lab.config.cts',
];

const TS_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);

/** The first default config file that exists in `dir`. */
export function findConfig(dir = process.cwd()): string | undefined {
  return CONFIG_FILES.map((f) => join(dir, f)).find((f) => existsSync(f));
}

async function importTs(path: string, prefer: 'auto' | 'native'): Promise<unknown> {
  if (prefer === 'auto') {
    let jiti: typeof import('jiti') | undefined;
    try {
      jiti = await import('jiti');
    } catch {
      // optional peer dependency not installed: fall back to Node's own type stripping
    }
    if (jiti) {
      return jiti
        .createJiti(pathToFileURL(path).href, { moduleCache: false, fsCache: false })
        .import(path);
    }
  }
  try {
    return await import(`${pathToFileURL(path).href}?t=${Date.now()}`);
  } catch (err) {
    throw new Error(
      `Could not load TypeScript config ${path}: ${(err as Error).message}\n` +
        'Install jiti (npm i -D jiti) to load .ts configs on any Node version, use Node 22.18+ ' +
        '(built-in type stripping), or rename the config to .mjs.',
      { cause: err },
    );
  }
}

/**
 * Load and validate a crash-lab config. JavaScript configs are imported natively. TypeScript
 * configs (.ts/.mts/.cts) use jiti when it is installed (optional peer dependency, handles
 * extensionless imports of your app), otherwise Node's built-in type stripping (Node 22.18+).
 * Every call re-reads the file, so edits are picked up.
 */
export async function loadConfig(
  file: string,
  cwd = process.cwd(),
  options: { typescript?: 'auto' | 'native' } = {},
): Promise<CrashLabConfig> {
  const path = resolve(cwd, file);
  if (!existsSync(path)) throw new Error(`Config not found: ${path}`);
  const mod = TS_EXTENSIONS.has(extname(path))
    ? await importTs(path, options.typescript ?? 'auto')
    : await import(`${pathToFileURL(path).href}?t=${Date.now()}`);
  const config = ((mod as { default?: unknown }).default ?? mod) as CrashLabConfig;
  if (!config || !config.target || typeof config.secret !== 'string' || !config.event?.id) {
    throw new Error(`Invalid config ${path}: must export default { target, secret, event }`);
  }
  return config;
}
