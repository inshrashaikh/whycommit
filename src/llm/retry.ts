// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { ProviderError, type ProviderErrorKind } from './provider';

/**
 * Retry helper for transient LLM failures.
 *
 * Only `429 Too Many Requests` and `5xx` server errors are retried; every
 * other failure is surfaced immediately because retrying it would not help.
 * The delay grows exponentially and is capped so that a request never waits
 * longer than `maxDelayMs`.
 */

export const DEFAULT_BASE_DELAY_MS = 500;
export const DEFAULT_MAX_DELAY_MS = 8_000;

export interface RetryInfo {
  /** 1-based index of the attempt that just failed. */
  attempt: number;
  /** 1-based index of the attempt that is about to be made. */
  nextAttempt: number;
  /** How long the helper waits before the next attempt. */
  delayMs: number;
  /** The error that caused the retry. */
  error: ProviderError;
}

export interface RetryOptions {
  /** Total number of attempts, including the first one. Defaults to 3. */
  maxAttempts?: number;
  /** Base delay of the exponential backoff. Defaults to 500 ms. */
  baseDelayMs?: number;
  /** Upper bound for a single delay. Defaults to 8000 ms. */
  maxDelayMs?: number;
  /** Signal that aborts the retries. */
  signal?: AbortSignal;
  /** Called before every retry. */
  onRetry?: (info: RetryInfo) => void;
  /** Injectable sleep, mainly used by the tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Error kinds that are worth retrying. */
const RETRYABLE_KINDS: ProviderErrorKind[] = ['rate-limit', 'server'];

/** True when the error is a transient failure that may succeed on a retry. */
export function isRetryableError(error: unknown): boolean {
  return error instanceof ProviderError && RETRYABLE_KINDS.includes(error.kind);
}

/**
 * Computes the backoff delay for an attempt.
 *
 * @param attempt      1-based index of the attempt that just failed.
 * @param baseDelayMs  The base delay.
 * @param maxDelayMs   The upper bound.
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
  maxDelayMs: number = DEFAULT_MAX_DELAY_MS,
): number {
  const exponent = Math.max(0, attempt - 1);
  const delay = baseDelayMs * Math.pow(2, exponent);
  return Math.min(delay, maxDelayMs);
}

/** Sleeps for the given time and rejects as soon as the signal is aborted. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderError('cancelled', 'The request was cancelled.'));
      return;
    }

    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(new ProviderError('cancelled', 'The request was cancelled.'));
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs an operation and retries it with exponential backoff.
 *
 * @param operation  The operation to run. Receives the 1-based attempt number.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? delay;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new ProviderError('cancelled', 'The request was cancelled.');
    }

    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= maxAttempts;
      if (isLastAttempt || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      options.onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error: error as ProviderError,
      });

      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}
