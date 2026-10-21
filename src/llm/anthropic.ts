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

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

/** Provider implementation for the Anthropic Messages API (Claude). */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly displayName = 'Anthropic Claude';
  readonly requiresApiKey = true;

  async generate(request: CompletionRequest, options: ProviderOptions): Promise<ProviderResult> {
    if (!options.apiKey) {
      throw new ProviderError(
        'no-api-key',
        'No Anthropic API key found. Run "Whycommit: Set API Key" to store one securely.',
      );
    }

    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;

    const response = await postJson<AnthropicResponse>({
      url: joinUrl(baseUrl, 'messages'),
      headers: {
        'x-api-key': options.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: {
        model: options.model,
        max_tokens: options.maxOutputTokens ?? 512,
        temperature: options.temperature ?? 0.3,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      },
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    const text = (response.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n')
      .trim();

    if (!text) {
      throw new ProviderError('empty-response', 'Anthropic returned an empty response.');
    }

    return {
      text,
      model: response.model ?? options.model,
    };
  }
}
