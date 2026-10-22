// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import {
  describeCommitrc,
  parseCommitrc,
  parseCommitrcSafe,
  validateSubject,
} from '../src/core/commitrc';

describe('parseCommitrc', () => {
  it('parses a valid configuration', () => {
    const result = parseCommitrc(
      JSON.stringify({
        types: ['feat', 'fix'],
        scopes: ['api', 'ui'],
        language: 'english',
        maxSubjectLength: 80,
        signOff: true,
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.config).toEqual({
      types: ['feat', 'fix'],
      scopes: ['api', 'ui'],
      language: 'english',
      maxSubjectLength: 80,
      signOff: true,
    });
  });

  it('accepts an empty object', () => {
    const result = parseCommitrc('{}');
    expect(result.valid).toBe(true);
    expect(result.config).toEqual({});
  });

  it('rejects an empty file', () => {
    const result = parseCommitrc('');
    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
  });

  it('rejects malformed JSON', () => {
    const result = parseCommitrc('{ "types": [');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not valid JSON');
  });

  it('rejects a non object payload', () => {
    const result = parseCommitrc('["feat"]');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must contain a JSON object');
  });

  it('rejects types that are not an array', () => {
    const result = parseCommitrc('{"types": "feat"}');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"types" must be an array of strings.');
  });

  it('rejects empty type names', () => {
    const result = parseCommitrc('{"types": ["feat", "  "]}');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('non-empty strings');
  });

  it('rejects an unknown language', () => {
    const result = parseCommitrc('{"language": "klingon"}');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"language"');
  });

  it('rejects a subject length that is out of range', () => {
    expect(parseCommitrc('{"maxSubjectLength": 5}').valid).toBe(false);
    expect(parseCommitrc('{"maxSubjectLength": 500}').valid).toBe(false);
    expect(parseCommitrc('{"maxSubjectLength": 72.5}').valid).toBe(false);
    expect(parseCommitrc('{"maxSubjectLength": 72}').valid).toBe(true);
  });

  it('rejects a non boolean signOff', () => {
    const result = parseCommitrc('{"signOff": "yes"}');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"signOff"');
  });

  it('warns about unknown keys but stays valid', () => {
    const result = parseCommitrc('{"types": ["feat"], "colour": "blue"}');
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('colour');
  });

  it('normalises types to lower case', () => {
    const result = parseCommitrc('{"types": ["FEAT", " Fix "]}');
    expect(result.config?.types).toEqual(['feat', 'fix']);
  });
});

describe('parseCommitrcSafe', () => {
  it('returns an invalid result for malformed JSON', () => {
    const result = parseCommitrcSafe('{oops');
    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
  });

  it('parses valid JSON', () => {
    const result = parseCommitrcSafe('{"types":["feat"]}');
    expect(result.valid).toBe(true);
    expect(result.config?.types).toEqual(['feat']);
  });
});

describe('validateSubject', () => {
  it('accepts a normal subject', () => {
    expect(validateSubject('feat(api): add the thing', null)).toEqual([]);
  });

  it('rejects an empty subject', () => {
    expect(validateSubject('   ', null)).toEqual(['The subject line is empty.']);
  });

  it('reports a subject that is too long', () => {
    const problems = validateSubject(`feat: ${'a'.repeat(80)}`, { maxSubjectLength: 72 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('maximum is 72');
  });

  it('reports a type that the .commitrc does not allow', () => {
    const problems = validateSubject('feat: something', { types: ['fix'] });
    expect(problems[0]).toContain('is not allowed');
  });

  it('reports a scope that the .commitrc does not allow', () => {
    const problems = validateSubject('feat(ui): something', { scopes: ['api'] });
    expect(problems[0]).toContain('scope');
  });

  it('reports a missing scope when scopes are configured', () => {
    const problems = validateSubject('feat: something', { scopes: ['api'] });
    expect(problems[0]).toContain('has none');
  });

  it('ignores the conventional format for plain subjects', () => {
    expect(validateSubject('just a message', null)).toEqual([]);
  });
});

describe('describeCommitrc', () => {
  it('returns nothing for a missing configuration', () => {
    expect(describeCommitrc(null)).toEqual([]);
  });

  it('describes every supported option', () => {
    const instructions = describeCommitrc({
      types: ['feat'],
      scopes: ['api'],
      maxSubjectLength: 60,
      signOff: true,
    });
    expect(instructions).toHaveLength(4);
    expect(instructions.join(' ')).toContain('Only use these commit types: feat.');
    expect(instructions.join(' ')).toContain('Only use these scopes: api.');
    expect(instructions.join(' ')).toContain('must not exceed 60 characters');
    expect(instructions.join(' ')).toContain('Signed-off-by');
  });
});
