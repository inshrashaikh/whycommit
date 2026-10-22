// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import { sanitizeCommitMessage } from '../src/utils/commitMessage';

describe('sanitizeCommitMessage', () => {
  it('keeps a clean message untouched', () => {
    expect(sanitizeCommitMessage('feat(api): add the thing')).toBe('feat(api): add the thing');
  });

  it('trims the surrounding whitespace', () => {
    expect(sanitizeCommitMessage('\n  feat: add thing  \n')).toBe('feat: add thing');
  });

  it('removes a code fence', () => {
    const result = sanitizeCommitMessage('```\nfeat: add thing\n\nThe body\n```');
    expect(result).toBe('feat: add thing\n\nThe body');
  });

  it('removes a code fence with a language tag', () => {
    expect(sanitizeCommitMessage('```text\nfeat: add thing\n```')).toBe('feat: add thing');
  });

  it('removes wrapping quotes', () => {
    expect(sanitizeCommitMessage('"feat: add thing"')).toBe('feat: add thing');
  });

  it('removes wrapping single quotes', () => {
    expect(sanitizeCommitMessage("'feat: add thing'")).toBe('feat: add thing');
  });

  it('removes a "Commit message:" preamble', () => {
    expect(sanitizeCommitMessage('Commit message: feat: add thing')).toBe('feat: add thing');
  });

  it('removes a verbose preamble', () => {
    expect(sanitizeCommitMessage('Here is the commit message: feat: add thing')).toBe(
      'feat: add thing',
    );
  });

  it('keeps a subject that legitimately starts with "commit:"', () => {
    expect(sanitizeCommitMessage('commit: add support for nested repos')).toBe(
      'commit: add support for nested repos',
    );
  });

  it('collapses more than one blank line', () => {
    expect(sanitizeCommitMessage('feat: x\n\n\n\nbody')).toBe('feat: x\n\nbody');
  });

  it('returns an empty string for an empty input', () => {
    expect(sanitizeCommitMessage('')).toBe('');
    expect(sanitizeCommitMessage('   ')).toBe('');
  });

  it('keeps the body separated by a single blank line', () => {
    const result = sanitizeCommitMessage('feat: x\n\nThe body\n\nAnother paragraph');
    expect(result).toBe('feat: x\n\nThe body\n\nAnother paragraph');
  });
});
