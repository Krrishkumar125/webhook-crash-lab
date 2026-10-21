import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig([
  {
    entry: { index: 'src/index.ts', bullmq: 'src/adapters/bullmq.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node20',
    external: ['bullmq'],
  },
  {
    entry: { cli: 'src/cli-bin.ts' },
    format: ['esm'],
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    define: { __VERSION__: JSON.stringify(version) },
    external: ['bullmq'],
  },
]);
