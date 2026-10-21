// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { ProviderError, type ProviderErrorKind } from './provider';

const DEFAULT_TIMEOUT_MS = 60_000;

export interface HttpErrorBody {
  status: number;
  statusText: string;
  message: string;
}

export interface JsonRequest {
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Error for a non 2xx HTTP response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly detail: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${detail}`);
    this.name = 'HttpError';
  }
}

function extractDetail(payload: unknown, raw: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string') {
        return message;
      }
      if (typeof error === 'string') {
        return error;
      }
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }
  return raw.slice(0, 500);
}

function mapStatusToKind(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }
  if (status === 429) {
    return 'rate-limit';
  }
  if (status >= 500) {
    return 'server';
  }
  return 'unknown';
}

/**
 * Posts a JSON payload and parses the JSON response.
 *
 * Every failure mode is normalised into a {@link ProviderError} so the calling
 * code can react to a stable set of error kinds.
 */
export async function postJson<T>(request: JsonRequest): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = (): void => controller.abort();
  request.signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(request.headers ?? {}),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: unknown = {};
    if (raw.length > 0) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { raw };
      }
    }

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, extractDetail(payload, raw));
    }

    return payload as T;
  } catch (error) {
    if (error instanceof HttpError) {
      throw new ProviderError(mapStatusToKind(error.status), error.message, { cause: error });
    }
    if (timedOut) {
      throw new ProviderError('timeout', `The request timed out after ${timeoutMs} ms.`, {
        cause: error,
      });
    }
    if (request.signal?.aborted) {
      throw new ProviderError('cancelled', 'The request was cancelled.', { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderError('network', `Could not reach the provider: ${message}`, {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Joins a base URL and a path without duplicating slashes. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
