// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import {
  extractErrorDetail,
  firstNonEmptyString,
  isPlainObject,
  safeJsonParse,
  truncate,
} from '../src/utils/json';

describe('safeJsonParse', () => {
  it('parses a valid JSON string', () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  it('returns the fallback for malformed JSON', () => {
    expect(safeJsonParse('{oops', { fallback: true })).toEqual({ fallback: true });
  });

  it('returns the fallback for an empty string', () => {
    expect(safeJsonParse('', { fallback: true })).toEqual({ fallback: true });
  });

  it('returns the fallback for a whitespace only string', () => {
    expect(safeJsonParse('   ', { fallback: true })).toEqual({ fallback: true });
  });

  it('returns the fallback for a JSON null', () => {
    expect(safeJsonParse('null', 'fallback')).toBe('fallback');
  });

  it('parses a JSON array', () => {
    expect(safeJsonParse<number[]>('[1,2]', [])).toEqual([1, 2]);
  });
});

describe('extractErrorDetail', () => {
  it('reads error.message', () => {
    expect(extractErrorDetail({ error: { message: 'Bad request' } })).toBe('Bad request');
  });

  it('reads a plain error string', () => {
    expect(extractErrorDetail({ error: 'Boom' })).toBe('Boom');
  });

  it('reads a top level message', () => {
    expect(extractErrorDetail({ message: 'Nope' })).toBe('Nope');
  });

  it('reads a top level detail', () => {
    expect(extractErrorDetail({ detail: 'Nope' })).toBe('Nope');
  });

  it('falls back to the raw body', () => {
    expect(extractErrorDetail({ unknown: true }, 'plain body')).toBe('plain body');
  });

  it('truncates a long message', () => {
    const long = 'a'.repeat(1000);
    const detail = extractErrorDetail({ error: { message: long } });
    expect(detail.length).toBeLessThanOrEqual(500);
    expect(detail.endsWith('…')).toBe(true);
  });

  it('returns an empty string for an empty payload', () => {
    expect(extractErrorDetail({}, '')).toBe('');
  });
});

describe('truncate', () => {
  it('keeps a short string', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('cuts a long string', () => {
    expect(truncate('hello world', 5)).toBe('hell…');
  });

  it('handles a zero length', () => {
    expect(truncate('hello', 0)).toBe('');
  });
});

describe('firstNonEmptyString', () => {
  it('returns the first non empty string', () => {
    expect(firstNonEmptyString(undefined, '', '  ', 'value')).toBe('value');
  });

  it('returns undefined when there is none', () => {
    expect(firstNonEmptyString(undefined, '', '   ')).toBeUndefined();
  });
});

describe('isPlainObject', () => {
  it('is true for an object', () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it('is false for an array, a string and null', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('text')).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});
