// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { joinUrl, postJson } from './http';
import {
  ProviderError,
  type CompletionRequest,
  type LlmProvider,
  type ProviderOptions,
  type ProviderResult,
} from './provider';

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaChatResponse {
  model?: string;
  message?: { role?: string; content?: string };
  done?: boolean;
}

/** Provider implementation for a local (or remote) Ollama server. */
export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;
  readonly displayName = 'Ollama (local)';
  readonly requiresApiKey = false;

  async generate(request: CompletionRequest, options: ProviderOptions): Promise<ProviderResult> {
    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;

    const response = await postJson<OllamaChatResponse>({
      url: joinUrl(baseUrl, 'api/chat'),
      headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : undefined,
      body: {
        model: options.model,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
        },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      },
      timeoutMs: options.timeoutMs ?? 120_000,
      signal: options.signal,
    });

    const text = response.message?.content?.trim() ?? '';

    if (!text) {
      throw new ProviderError('empty-response', 'Ollama returned an empty response.');
    }

    return {
      text,
      model: response.model ?? options.model,
    };
  }
}
