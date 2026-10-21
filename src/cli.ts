import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { demoConfig, type DemoMode } from './demo/app.js';
import { toHtml } from './report/html.js';
import { toJson, toText } from './report/text.js';
import { runCrashLab } from './runner.js';
import type { CrashLabConfig, CrashLabResult } from './types.js';

declare const __VERSION__: string | undefined;
export interface Io {
  log(s: string): void;
  error(s: string): void;
}

const HELP = `webhook-crash-lab — crash-test your webhook handler

Usage:
  webhook-crash-lab demo [--mode broken|fixed] [--html file] [--json file]
  webhook-crash-lab run [config] [--html file] [--json file] [--quiet]

  config     A .js/.mjs file exporting a config (default: crash-lab.config.mjs)
  --html     Write a plain-English HTML report
  --json     Write a JSON report
  --quiet    Only print the summary line

Exit codes: 0 no failures, 1 failures found, 2 usage or config error.`;

const version = () => (typeof __VERSION__ === 'string' ? __VERSION__ : '0.1.0');

function write(result: CrashLabResult, html?: string, json?: string) {
  if (html) writeFileSync(html, toHtml(result));
  if (json) writeFileSync(json, toJson(result));
}

export async function main(argv: string[], io: Io = console): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        quiet: { type: 'boolean', short: 'q' },
        html: { type: 'string' },
        json: { type: 'string' },
        mode: { type: 'string' },
      },
    });
  } catch (e) {
    io.error((e as Error).message);
    return 2;
  }
  const { values, positionals } = parsed;
  const [cmd, file] = positionals;
  if (values.version) return (io.log(version()), 0);
  if (values.help || !cmd) return (io.log(HELP), 0);

  if (cmd === 'demo') {
    const modes: DemoMode[] = values.mode ? [values.mode as DemoMode] : ['broken', 'fixed'];
    let last: CrashLabResult | undefined;
    for (const mode of modes) {
      last = await runCrashLab(demoConfig(mode));
      io.log(
        `\n=== ${mode === 'broken' ? 'BROKEN handler (typical AI-generated code)' : 'FIXED handler'} ===`,
      );
      io.log(toText(last));
    }
    write(last as CrashLabResult, values.html, values.json);
    return values.mode === 'broken' ? 1 : 0;
  }

  if (cmd === 'run') {
    const path = resolve(file ?? 'crash-lab.config.mjs');
    if (!existsSync(path)) return (io.error(`Config not found: ${path}`), 2);
    let config: CrashLabConfig;
    try {
      const mod = (await import(pathToFileURL(path).href)) as { default?: CrashLabConfig };
      config = mod.default as CrashLabConfig;
      if (!config || !config.target || typeof config.secret !== 'string' || !config.event?.id)
        throw new Error('config must export default { target, secret, event }');
    } catch (e) {
      io.error(`Invalid config ${path}: ${(e as Error).message}`);
      return 2;
    }
    const result = await runCrashLab(config);
    const text = toText(result);
    io.log(values.quiet ? (text.split('\n').pop() as string) : text);
    write(result, values.html, values.json);
    return result.ok ? 0 : 1;
  }

  io.error(`Unknown command "${cmd}".\n\n${HELP}`);
  return 2;
}
