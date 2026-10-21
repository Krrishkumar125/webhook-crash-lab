import { toText } from './report/text.js';
import type { CrashLabResult } from './types.js';

export { runCrashLab } from './runner.js';
export { SCENARIOS } from './scenarios.js';
export {
  signGithub,
  signPayload,
  verifyGithub,
  verifySignature,
  type VerifyOptions,
} from './signing.js';
export { toText, toJson } from './report/text.js';
export { toHtml } from './report/html.js';
export {
  createDemoApp,
  demoConfig,
  type DemoMode,
  type DemoOptions,
  type Enqueue,
} from './demo/app.js';
export type * from './types.js';

/** Throw (failing your Vitest/Jest test) with a readable report if any scenario failed. */
export function assertNoCrashes(result: CrashLabResult): void {
  if (!result.ok)
    throw new Error(
      `webhook-crash-lab found ${result.summary.fail} problem(s)\n\n${toText(result)}`,
    );
}

/** Identity helper for typed config files: `export default defineConfig({...})`. */
export const defineConfig = <T extends import('./types.js').CrashLabConfig>(c: T): T => c;
