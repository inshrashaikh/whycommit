// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Ambient declarations for non-TypeScript assets that are inlined by esbuild.
 */

/** Plain text files (prompt templates) are bundled via the esbuild `text` loader. */
declare module '*.txt' {
  const content: string;
  export default content;
}
