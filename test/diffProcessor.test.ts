// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import {
  countChanges,
  extractPath,
  isBinarySection,
  isLockfile,
  processDiff,
  splitDiffSections,
} from '../src/core/diffProcessor';

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 111..222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,5 @@
 import express from 'express';
+import helmet from 'helmet';
+
 const app = express();
+app.use(helmet());
`;

const LOCKFILE_DIFF = `diff --git a/package-lock.json b/package-lock.json
index 333..444 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,2 +1,900 @@
 {"lockfileVersion": 3}
`;

const BINARY_DIFF = `diff --git a/assets/logo.png b/assets/logo.png
index 555..666 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

function makeFile(path: string, lines: number): string {
  const body: string[] = [];
  for (let index = 0; index < lines; index += 1) {
    body.push(`+const value${index} = ${index};`);
  }
  return `diff --git a/${path} b/${path}\nindex 111..222 100644\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1,${lines} @@\n${body.join('\n')}\n`;
}

describe('splitDiffSections', () => {
  it('splits a diff into one section per file', () => {
    const sections = splitDiffSections(`${SIMPLE_DIFF}${LOCKFILE_DIFF}`);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('src/app.ts');
    expect(sections[1]).toContain('package-lock.json');
  });

  it('returns an empty array for an empty diff', () => {
    expect(splitDiffSections('')).toEqual([]);
    expect(splitDiffSections('   \n  ')).toEqual([]);
  });
});

describe('extractPath', () => {
  it('extracts the path of a modified file', () => {
    expect(extractPath(SIMPLE_DIFF)).toBe('src/app.ts');
  });

  it('extracts the path of a new file', () => {
    const diff = `diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello\n`;
    expect(extractPath(diff)).toBe('new.txt');
  });

  it('extracts the path of a deleted file', () => {
    const diff = `diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-hello\n`;
    expect(extractPath(diff)).toBe('gone.txt');
  });

  it('handles quoted paths with spaces', () => {
    const diff = `diff --git "a/my file.txt" "b/my file.txt"\n--- "a/my file.txt"\n+++ "b/my file.txt"\n@@ -1 +1 @@\n-a\n+b\n`;
    expect(extractPath(diff)).toBe('my file.txt');
  });
});

describe('isBinarySection', () => {
  it('detects binary diffs', () => {
    expect(isBinarySection(BINARY_DIFF)).toBe(true);
    expect(isBinarySection(SIMPLE_DIFF)).toBe(false);
  });
});

describe('isLockfile', () => {
  it('detects dependency lockfiles', () => {
    expect(isLockfile('package-lock.json')).toBe(true);
    expect(isLockfile('yarn.lock')).toBe(true);
    expect(isLockfile('Cargo.lock')).toBe(true);
    expect(isLockfile('pnpm-lock.yaml')).toBe(true);
  });

  it('does not treat regular source files as lockfiles', () => {
    expect(isLockfile('src/index.ts')).toBe(false);
    expect(isLockfile('README.md')).toBe(false);
  });

  it('keeps dependency manifests that carry meaning', () => {
    // go.mod lists the dependencies of a Go module and is worth describing.
    expect(isLockfile('go.mod')).toBe(false);
    expect(isLockfile('go.sum')).toBe(true);
  });
});

describe('countChanges', () => {
  it('counts insertions and deletions but not the file headers', () => {
    const changes = countChanges(SIMPLE_DIFF);
    expect(changes.insertions).toBe(3);
    expect(changes.deletions).toBe(0);
  });
});

describe('processDiff', () => {
  it('returns an empty result for an empty diff', () => {
    const result = processDiff('', 12000);
    expect(result.text).toBe('');
    expect(result.includedFiles).toEqual([]);
    expect(result.skippedFiles).toEqual([]);
    expect(result.stats.filesChanged).toBe(0);
    expect(result.estimatedTokens).toBe(0);
  });

  it('keeps regular source files', () => {
    const result = processDiff(SIMPLE_DIFF, 12000);
    expect(result.includedFiles).toEqual(['src/app.ts']);
    expect(result.text).toContain('helmet');
    expect(result.stats.insertions).toBe(3);
  });

  it('skips lockfiles', () => {
    const result = processDiff(`${SIMPLE_DIFF}${LOCKFILE_DIFF}`, 12000);
    expect(result.includedFiles).toEqual(['src/app.ts']);
    expect(result.skippedFiles).toEqual([{ path: 'package-lock.json', reason: 'lockfile' }]);
    expect(result.stats.lockfilesSkipped).toBe(1);
    expect(result.text).not.toContain('lockfileVersion');
  });

  it('skips binary files', () => {
    const result = processDiff(`${SIMPLE_DIFF}${BINARY_DIFF}`, 12000);
    expect(result.includedFiles).toEqual(['src/app.ts']);
    expect(result.skippedFiles).toEqual([{ path: 'assets/logo.png', reason: 'binary' }]);
    expect(result.stats.binaryFiles).toBe(1);
    expect(result.text).not.toContain('Binary files');
  });

  it('mentions the skipped files in the statistics header', () => {
    const result = processDiff(`${LOCKFILE_DIFF}${BINARY_DIFF}`, 12000);
    expect(result.text).toContain('# skipped files:');
    expect(result.text).toContain('package-lock.json (lockfile)');
    expect(result.text).toContain('assets/logo.png (binary)');
  });

  it('truncates a huge diff to the token budget', () => {
    let diff = '';
    for (let index = 0; index < 20; index += 1) {
      diff += makeFile(`src/file${index}.ts`, 400);
    }

    const result = processDiff(diff, 500);
    const charBudget = 500 * 4;

    expect(result.truncated).toBe(true);
    expect(result.truncatedFiles.length).toBeGreaterThan(0);
    expect(result.text.length).toBeLessThanOrEqual(charBudget);
    expect(result.text).toContain('more diff lines omitted');
  });

  it('drops the files that do not fit into the budget and reports them', () => {
    let diff = '';
    for (let index = 0; index < 200; index += 1) {
      diff += makeFile(`src/file${index}.ts`, 200);
    }

    const result = processDiff(diff, 500);

    expect(result.text.length).toBeLessThanOrEqual(500 * 4);
    expect(result.text).toContain('more file(s) omitted');
    expect(result.includedFiles.length).toBeLessThan(200);
    expect(result.truncated).toBe(true);
    expect(result.stats.filesChanged).toBe(200);
  });

  it('keeps a small diff inside the budget untouched', () => {
    const result = processDiff(SIMPLE_DIFF, 12000);
    expect(result.truncated).toBe(false);
    expect(result.truncatedFiles).toEqual([]);
    expect(result.text).toContain('import helmet from');
  });

  it('keeps the budget for many files even when the per-file floor applies', () => {
    let diff = '';
    for (let index = 0; index < 50; index += 1) {
      diff += makeFile(`src/file${index}.ts`, 200);
    }

    const result = processDiff(diff, 500);
    expect(result.text.length).toBeLessThanOrEqual(500 * 4);
  });

  it('reports the number of changed files including the skipped ones', () => {
    const result = processDiff(`${SIMPLE_DIFF}${LOCKFILE_DIFF}${BINARY_DIFF}`, 12000);
    expect(result.stats.filesChanged).toBe(3);
  });
});
