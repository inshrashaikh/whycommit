// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { defineConfig } from 'vitest/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * The `vscode` module does not exist outside of VS Code, so it is aliased to a
 * small in-memory mock. Plain text prompt templates are inlined with a tiny
 * plugin so the production code can import them exactly as esbuild does.
 */
export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./test/mocks/vscode.ts', import.meta.url)),
    },
  },
  plugins: [
    {
      name: 'whycommit-text-loader',
      enforce: 'pre',
      async load(id: string) {
        const [filePath] = id.split('?');
        if (!filePath.endsWith('.txt')) {
          return null;
        }
        const content = await readFile(filePath, 'utf8');
        return `export default ${JSON.stringify(content)};`;
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
    },
  },
});
