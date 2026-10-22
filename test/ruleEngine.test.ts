// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import { runRuleEngine } from '../src/core/ruleEngine';
import { parseStagedDiff } from '../src/core/ruleEngine/diffParser';

describe('rule engine', () => {
  it('generates message for docs only', () => {
    const diff = `diff --git a/README.md b/README.md
index 123..456 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 # Hello
+World
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.type).toBe('docs');
    expect(result.subject).toMatch(/^docs/);
  });

  it('generates message for tests only', () => {
    const diff = `diff --git a/test/foo.test.ts b/test/foo.test.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/test/foo.test.ts
@@ -0,0 +1 @@
+test('x', ()=>{})
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.type).toBe('test');
  });

  it('generates message for new feature', () => {
    const diff = `diff --git a/src/feature.ts b/src/feature.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/src/feature.ts
@@ -0,0 +5 @@
+export function login() {}
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.type).toBe('feat');
    expect(result.subject.length).toBeLessThanOrEqual(72);
  });

  it('generates message for bug fix', () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
index 123..456 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1 +1 @@
-function login() { return null; }
+function login() { if(!user) return null; }
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.type).toBe('fix');
  });

  it('generates message for refactor', () => {
    const diff = `diff --git a/src/util.ts b/src/util.ts
index 123..456 100644
--- a/src/util.ts
+++ b/src/util.ts
@@ -1,3 +1,3 @@
-const a = 1;
-const b = 2;
+const a = 1;
+const b = 3;
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.subject).toBeTruthy();
  });

  it('generates message for config change', () => {
    const diff = `diff --git a/package.json b/package.json
index 123..456 100644
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-{"version":"1.0.0"}
+{"version":"1.0.1"}
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.type).toBeTruthy();
  });

  it('handles mixed files with scope detection', () => {
    const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/src/auth/login.ts
@@ -0,0 +1 @@
+export function login(){}
diff --git a/src/auth/utils.ts b/src/auth/utils.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/src/auth/utils.ts
@@ -0,0 +1 @@
+export function util(){}
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.subject).toBeTruthy();
  });

  it('handles binary files', () => {
    const diff = `diff --git a/image.png b/image.png
new file mode 100644
index 0000..1234
Binary files /dev/null and b/image.png differ
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.subject).toBeTruthy();
  });

  it('handles empty diff', () => {
    const result = runRuleEngine({
      rawDiff: '',
      files: [],
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.subject).toBeTruthy();
  });

  it('wraps function names in backticks in the subject', () => {
    const diff = `diff --git a/src/math.ts b/src/math.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/src/math.ts
@@ -0,0 +1,2 @@
+export function add(a: number, b: number) { return a + b; }
+export function greet(name: string) { return 'hi ' + name; }
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.subject).toContain('`add`');
    expect(result.subject).toContain('`greet`');
  });

  it('wraps file names in backticks in the subject', () => {
    const diff = `diff --git a/README.md b/README.md
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
+# Whycommit
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.subject).toContain('`README.md`');
  });

  it('omits the scope when all changed files are in the repository root', () => {
    const diff = `diff --git a/index.ts b/index.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/index.ts
@@ -0,0 +1,4 @@
+export function main() {
+  return 1;
+}
+export const extra = 2;
diff --git a/README.md b/README.md
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
+# Whycommit
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      why: undefined,
      commitrc: null,
      repoStyle: null,
    });
    expect(result.scope).toBeUndefined();
    expect(result.subject).not.toMatch(/^[a-z]+\(/);
  });

  it('supports Hinglish output and Why', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
new file mode 100644
index 0000..1234
--- /dev/null
+++ b/src/app.ts
@@ -0,0 +1 @@
+export function app(){}
`;
    const result = runRuleEngine({
      rawDiff: diff,
      files: parseStagedDiff(diff),
      branch: 'main',
      recentCommits: [],
      language: 'hinglish',
      why: 'better UX',
      commitrc: null,
      repoStyle: null,
    });
    expect(result.fullMessage).toContain('Why: better UX');
  });
});
