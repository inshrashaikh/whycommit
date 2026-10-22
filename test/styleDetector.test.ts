// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import { detectStyle, describeStyle } from '../src/core/styleDetector';

describe('detectStyle', () => {
  it('returns unknown for an empty history', () => {
    const detection = detectStyle([]);
    expect(detection.style).toBe('unknown');
    expect(detection.confidence).toBe(0);
    expect(detection.sampleSize).toBe(0);
  });

  it('ignores blank subjects', () => {
    const detection = detectStyle(['', '   ']);
    expect(detection.sampleSize).toBe(0);
  });

  it('detects conventional commits with scopes', () => {
    const detection = detectStyle([
      'feat(auth): add login',
      'fix(parser): handle empty input',
      'chore(deps): bump vitest',
    ]);
    expect(detection.style).toBe('conventional');
    expect(detection.confidence).toBeCloseTo(1);
    expect(detection.types).toEqual(['chore', 'feat', 'fix']);
    expect(detection.scopes).toEqual(['auth', 'deps', 'parser']);
  });

  it('detects angular style headers without scopes', () => {
    const detection = detectStyle(['feat: add login', 'fix: correct the parser']);
    expect(detection.style).toBe('angular');
    expect(detection.types).toEqual(['feat', 'fix']);
    expect(detection.scopes).toEqual([]);
  });

  it('detects gitmoji prefixes', () => {
    const detection = detectStyle([':sparkles: add login', ':bug: fix parser', ':memo: docs']);
    expect(detection.style).toBe('gitmoji');
  });

  it('detects plain commit messages', () => {
    const detection = detectStyle(['update the parser', 'fix a typo', 'more work']);
    expect(detection.style).toBe('plain');
  });

  it('flags breaking changes', () => {
    const detection = detectStyle(['feat(api)!: drop v1', 'fix: typo']);
    expect(detection.hasBreakingChanges).toBe(true);
  });

  it('does not report a breaking change when there is none', () => {
    const detection = detectStyle(['feat(api): add v2']);
    expect(detection.hasBreakingChanges).toBe(false);
  });

  it('ignores unknown types', () => {
    const detection = detectStyle(['wibble: something odd', 'feat: real change']);
    expect(detection.types).toEqual(['feat']);
  });
});

describe('describeStyle', () => {
  it('describes every style', () => {
    expect(describeStyle(detectStyle(['feat(a): x']))).toContain('Conventional Commits');
    expect(describeStyle(detectStyle(['feat: x']))).toContain('Angular');
    expect(describeStyle(detectStyle([':sparkles: x']))).toContain('gitmoji');
    expect(describeStyle(detectStyle(['plain text']))).toContain('plain');
    expect(describeStyle(detectStyle([]))).toContain('Conventional Commits');
  });
});
