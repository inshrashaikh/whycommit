// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Small, dependency free helpers for dealing with JSON payloads that come
 * from the outside world (LLM APIs, configuration files, ...).
 *
 * Everything in here is defensive: a malformed payload must never throw an
 * unhandled exception, it must degrade into a usable fallback value.
 */

/** Default maximum length of an extracted error message. */
export const MAX_ERROR_DETAIL_LENGTH = 500;

/**
 * Parses a JSON string without throwing.
 *
 * @returns The parsed value, or `fallback` when the input is not valid JSON.
 */
export function safeJsonParse<T>(raw: string, fallback: T): T {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === undefined || parsed === null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/**
 * Extracts a human readable error message out of an arbitrary API payload.
 *
 * Handles the shapes used by Anthropic (`error.message`), OpenAI
 * (`error.message` / `message`), Ollama (`error`) and plain text bodies.
 */
export function extractErrorDetail(
  payload: unknown,
  raw = '',
  maxLength = MAX_ERROR_DETAIL_LENGTH,
): string {
  const fromPayload = extractFromPayload(payload);
  const source = fromPayload ?? raw ?? '';
  return truncate(source.trim(), maxLength);
}

function extractFromPayload(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  const error = record.error;
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  if (typeof record.message === 'string' && record.message.trim().length > 0) {
    return record.message;
  }
  if (typeof record.detail === 'string' && record.detail.trim().length > 0) {
    return record.detail;
  }

  return undefined;
}

/** Truncates a string and appends an ellipsis when it had to be cut. */
export function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * Returns the first argument that is a non-empty string.
 * Useful for optional API response fields.
 */
export function firstNonEmptyString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Narrows an unknown value to a plain object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
