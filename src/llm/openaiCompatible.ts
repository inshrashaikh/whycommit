// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { HttpError, joinUrl, postJson } from './http';
import {
  ProviderError,
  type CompletionRequest,
  type LlmProvider,
  type ProviderOptions,
  type ProviderResult,
} from './provider';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAIChatResponse {
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string | null };
    finish_reason?: string;
  }>;
}

/**
 * Provider implementation for OpenAI and any OpenAI-compatible `/chat/completions`
 * endpoint (Google Gemini, Groq, OpenRouter, OpenCode Zen, Azure gateways,
 * LiteLLM, vLLM, ...).
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly id = 'openai' as const;
  readonly displayName = 'OpenAI / OpenAI-compatible';
  readonly requiresApiKey = true;

  async generate(request: CompletionRequest, options: ProviderOptions): Promise<ProviderResult> {
    if (!options.apiKey) {
      throw new ProviderError(
        'no-api-key',
        'No API key found. Run "Whycommit: Set API Key" to store one securely.',
      );
    }

    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const maxTokens = options.maxOutputTokens ?? 512;

    const messages = [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ];

    let response: OpenAIChatResponse;
    try {
      response = await postJson<OpenAIChatResponse>({
        url: joinUrl(baseUrl, 'chat/completions'),
        headers: {
          authorization: `Bearer ${options.apiKey}`,
        },
        body: {
          model: options.model,
          max_tokens: maxTokens,
          temperature: options.temperature ?? 0.3,
          messages,
        },
        timeoutMs: options.timeoutMs,
        signal: options.signal,
      });
    } catch (error) {
      // Newer OpenAI models renamed `max_tokens` to `max_completion_tokens`.
      // Retry once with the new name when the server complains about it.
      if (isMaxTokensUnsupported(error)) {
        response = await postJson<OpenAIChatResponse>({
          url: joinUrl(baseUrl, 'chat/completions'),
          headers: {
            authorization: `Bearer ${options.apiKey}`,
          },
          body: {
            model: options.model,
            max_completion_tokens: maxTokens,
            temperature: options.temperature ?? 0.3,
            messages,
          },
          timeoutMs: options.timeoutMs,
          signal: options.signal,
        });
      } else {
        throw error;
      }
    }

    const choice = response.choices?.[0];
    const text = choice?.message?.content?.trim() ?? '';

    if (!text) {
      throw new ProviderError('empty-response', 'The provider returned an empty response.');
    }

    return {
      text,
      model: response.model ?? options.model,
    };
  }
}

/** True when the server rejected the request because of `max_tokens`. */
function isMaxTokensUnsupported(error: unknown): boolean {
  if (!(error instanceof ProviderError)) {
    return false;
  }
  const cause = error.cause;
  if (!(cause instanceof HttpError)) {
    return false;
  }
  return cause.status === 400 && /max_tokens|max_completion_tokens/i.test(cause.detail);
}
