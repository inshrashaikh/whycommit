// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Bundles the extension into a single CommonJS file (out/extension.js) using esbuild.
 *
 * Usage:
 *   node esbuild.js            -> one-off production build
 *   node esbuild.js --watch    -> rebuild on change (used by the F5 launch task)
 */

const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Reports esbuild diagnostics in a `tsc`-like shape so VS Code can show them in Problems. */
const diagnosticsPlugin = {
  name: 'whycommit-diagnostics',
  setup(build) {
    build.onStart(() => {
      console.log('[whycommit] build started');
    });
    build.onEnd((result) => {
      for (const error of result.errors) {
        const loc = error.location;
        const where = loc ? `${loc.file}:${loc.line}:${loc.column}` : 'esbuild';
        console.error(`${where}: error: ${error.text}`);
      }
      for (const warning of result.warnings) {
        const loc = warning.location;
        const where = loc ? `${loc.file}:${loc.line}:${loc.column}` : 'esbuild';
        console.warn(`${where}: warning: ${warning.text}`);
      }
      console.log('[whycommit] build finished');
    });
  },
};

/** The copyright header that is kept in the bundle. */
const COPYRIGHT_BANNER = `/*!
 * Copyright (c) 2026 Shaikh Inshra. All rights reserved.
 * Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.
 */`;

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'silent',
  // Every comment is stripped from the bundle, the copyright header is added
  // back through the banner below.
  legalComments: 'none',
  banner: { js: COPYRIGHT_BANNER },
  // Prompt templates are plain text files that are inlined into the bundle.
  loader: { '.txt': 'text' },
  plugins: [diagnosticsPlugin],
};

async function main() {
  if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log('[whycommit] watching for changes...');
    return;
  }

  await esbuild.build(options);
}

main().catch((error) => {
  console.error('[whycommit] build failed:', error);
  process.exit(1);
});
