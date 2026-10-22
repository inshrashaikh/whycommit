// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../src/llm/provider';
import { computeBackoffDelay, delay, isRetryableError, withRetry } from '../src/llm/retry';

describe('isRetryableError', () => {
  it('retries rate limits and server errors', () => {
    expect(isRetryableError(new ProviderError('rate-limit', 'too many'))).toBe(true);
    expect(isRetryableError(new ProviderError('server', 'boom'))).toBe(true);
  });

  it('does not retry other errors', () => {
    expect(isRetryableError(new ProviderError('unauthorized', 'nope'))).toBe(false);
    expect(isRetryableError(new ProviderError('network', 'offline'))).toBe(false);
    expect(isRetryableError(new ProviderError('no-api-key', 'missing'))).toBe(false);
    expect(isRetryableError(new Error('plain'))).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  it('grows exponentially', () => {
    expect(computeBackoffDelay(1, 500, 8000)).toBe(500);
    expect(computeBackoffDelay(2, 500, 8000)).toBe(1000);
    expect(computeBackoffDelay(3, 500, 8000)).toBe(2000);
    expect(computeBackoffDelay(4, 500, 8000)).toBe(4000);
  });

  it('is capped by the maximum delay', () => {
    expect(computeBackoffDelay(10, 500, 8000)).toBe(8000);
  });
});

describe('withRetry', () => {
  const sleep = vi.fn(async () => undefined);

  it('returns the result of a successful attempt', async () => {
    const operation = vi.fn(async () => 'ok');
    await expect(withRetry(operation, { sleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit and succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError('rate-limit', 'slow down'))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(operation, { sleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries a server error', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError('server', 'boom'))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(operation, { sleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non retryable error', async () => {
    const operation = vi.fn().mockRejectedValue(new ProviderError('unauthorized', 'nope'));

    await expect(withRetry(operation, { sleep })).rejects.toThrow('nope');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new ProviderError('server', 'boom'));

    await expect(withRetry(operation, { maxAttempts: 3, sleep })).rejects.toThrow('boom');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('waits with an exponential backoff between the attempts', async () => {
    const delays: number[] = [];
    const operation = vi.fn().mockRejectedValue(new ProviderError('server', 'boom'));

    await expect(
      withRetry(operation, {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 10_000,
        sleep: async (ms: number) => {
          delays.push(ms);
        },
      }),
    ).rejects.toThrow('boom');

    expect(delays).toEqual([100, 200, 400]);
  });

  it('reports every retry through the callback', async () => {
    const onRetry = vi.fn();
    const operation = vi.fn().mockRejectedValue(new ProviderError('rate-limit', 'slow'));

    await expect(withRetry(operation, { maxAttempts: 2, sleep, onRetry })).rejects.toThrow();

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1, nextAttempt: 2 });
  });

  it('passes the attempt number to the operation', async () => {
    const operation = vi.fn(async () => 'ok');
    await withRetry(operation, { maxAttempts: 3, sleep });
    expect(operation).toHaveBeenCalledWith(1);
  });

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn();

    await expect(withRetry(operation, { signal: controller.signal, sleep })).rejects.toThrow(
      'cancelled',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('stops retrying when the signal is aborted during the backoff', async () => {
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(new ProviderError('server', 'boom'));

    await expect(
      withRetry(operation, {
        maxAttempts: 5,
        signal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      }),
    ).rejects.toThrow('cancelled');
  });
});

describe('delay', () => {
  it('resolves after the given time', async () => {
    const start = Date.now();
    await delay(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(delay(1000, controller.signal)).rejects.toThrow('cancelled');
  });

  it('rejects when the signal is aborted while waiting', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await expect(delay(5000, controller.signal)).rejects.toThrow('cancelled');
  });
});
