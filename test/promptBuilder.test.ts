// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import { PromptBuilder, render, stripFileHeader } from '../src/core/promptBuilder';
import { processDiff } from '../src/core/diffProcessor';
import { detectStyle } from '../src/core/styleDetector';

const DIFF = `diff --git a/src/app.ts b/src/app.ts
index 111..222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,5 @@
 import express from 'express';
+import helmet from 'helmet';
 const app = express();
`;

describe('render', () => {
  it('replaces known placeholders', () => {
    expect(render('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  it('removes unknown placeholders', () => {
    expect(render('Hello {{missing}}!', {})).toBe('Hello !');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(render('Hello {{ name }}!', { name: 'World' })).toBe('Hello World!');
  });
});

describe('stripFileHeader', () => {
  it('removes the leading comment lines', () => {
    const template = '; Copyright (c) 2026 Someone\n; Proprietary\n\nHello';
    expect(stripFileHeader(template)).toBe('Hello');
  });

  it('leaves a template without a header untouched', () => {
    expect(stripFileHeader('Hello')).toBe('Hello');
  });
});

describe('PromptBuilder', () => {
  const builder = new PromptBuilder();

  it('builds a prompt that contains the diff, the branch and the language', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'feature/security',
      recentCommits: ['feat(auth): add login'],
      language: 'english',
    });

    expect(prompt.user).toContain('feature/security');
    expect(prompt.user).toContain('helmet');
    expect(prompt.user).toContain('feat(auth): add login');
    expect(prompt.system.length).toBeGreaterThan(0);
  });

  it('never leaks the copyright header into the prompt', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: [],
      language: 'english',
    });

    expect(prompt.system).not.toContain('Copyright (c)');
    expect(prompt.user).not.toContain('Copyright (c)');
  });

  it('leaves no unresolved placeholders', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: [],
      language: 'hinglish',
    });

    expect(/\{\{\s*\w+\s*\}\}/.test(prompt.system)).toBe(false);
    expect(/\{\{\s*\w+\s*\}\}/.test(prompt.user)).toBe(false);
  });

  it('mentions the Hinglish language', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: [],
      language: 'hinglish',
    });

    expect(prompt.user).toContain('Hinglish');
  });

  it('falls back to a placeholder when there is no history', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: [],
      language: 'english',
    });

    expect(prompt.user).toContain('no commit history available');
  });

  it('describes the detected commit style', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: ['feat(api): add login', 'fix(ui): correct the layout'],
      language: 'english',
      style: detectStyle(['feat(api): add login', 'fix(ui): correct the layout']),
    });

    expect(prompt.user).toContain('Commit style used in this repository');
    expect(prompt.user).toContain('Conventional Commits');
  });

  it('includes the .commitrc instructions', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      commitrc: { types: ['feat', 'fix'], maxSubjectLength: 60, signOff: true },
    });

    expect(prompt.system).toContain('Only use these commit types: feat, fix.');
    expect(prompt.system).toContain('must not exceed 60 characters');
    expect(prompt.system).toContain('Signed-off-by');
  });

  it('does not add .commitrc instructions when there is no configuration', () => {
    const prompt = builder.build({
      diff: processDiff(DIFF, 12000),
      branch: 'main',
      recentCommits: [],
      language: 'english',
      commitrc: null,
    });

    expect(prompt.system).not.toContain('Only use these commit types');
  });
});
