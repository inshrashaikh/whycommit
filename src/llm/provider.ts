// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import type { ProviderId } from '../config/settings';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenAICompatibleProvider } from './openaiCompatible';
import { RuleBasedProvider } from './ruleBased';
import { VsCodeLmProvider } from './vscodeLm';

export type { ProviderId };

/** A prompt split into a system instruction and a user message. */
export interface CompletionRequest {
  system: string;
  user: string;
}

/** Everything a provider needs to talk to its backend. */
export interface ProviderOptions {
  /** Model id. */
  model: string;
  /** Base URL of the API. */
  baseUrl: string;
  /** API key, if the provider needs one. */
  apiKey?: string;
  /** Sampling temperature. */
  temperature?: number;
  /** Maximum number of tokens the model may produce. */
  maxOutputTokens?: number;
  /** Abort signal used for cancellation. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** The result of a successful generation. */
export interface ProviderResult {
  /** The generated text. */
  text: string;
  /** The model that actually served the request. */
  model: string;
}

export type ProviderErrorKind =
  | 'no-api-key'
  | 'unauthorized'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'server'
  | 'empty-response'
  | 'cancelled'
  | 'unknown';

/** Error raised by every provider implementation. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

/**
 * The contract every provider implements. Adding a new backend only requires a
 * new implementation of this interface plus one entry in `createProvider`.
 */
export interface LlmProvider {
  /** Stable identifier of the provider. */
  readonly id: ProviderId;
  /** Human readable name. */
  readonly displayName: string;
  /** Whether the provider needs an API key. */
  readonly requiresApiKey: boolean;
  /** Generates a completion for the given prompt. */
  generate(request: CompletionRequest, options: ProviderOptions): Promise<ProviderResult>;
}

/** Returns the SecretStorage key that holds the API key for a provider. */
export function secretKeyFor(provider: ProviderId): string {
  return `whycommit.apiKey.${provider}`;
}

/**
 * Creates the provider implementation for the given provider id.
 *
 * Anthropic and Ollama speak their own protocols, everything else uses the
 * OpenAI Chat Completions format.
 */
export function createProvider(provider: ProviderId): LlmProvider {
  switch (provider) {
    case 'rulebased':
      return new RuleBasedProvider();
    case 'vscode-lm':
      return new VsCodeLmProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'openai':
    case 'gemini':
    case 'groq':
    case 'openrouter':
    case 'opencode':
    case 'custom':
      return new OpenAICompatibleProvider();
    case 'auto':
      // Auto is handled by resolveAutoProvider, but provide fallback
      return new RuleBasedProvider();
    default: {
      const exhaustive: never = provider;
      throw new ProviderError('unknown', `Unsupported provider: ${String(exhaustive)}`);
    }
  }
}

export async function resolveAutoProvider(hasApiKey: boolean, ollamaAvailable: boolean): Promise<LlmProvider> {
  // If the user has configured an API key or Ollama, use that provider.
  if (hasApiKey) {
    // We'll let the caller determine which specific provider, but prefer configured
    // For now return undefined to indicate caller should use configured
  }
  if (ollamaAvailable) {
    return new OllamaProvider();
  }
  // Try VS Code LM if available
  try {
    const vscode = await import('vscode');
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length > 0) {
      return new VsCodeLmProvider();
    }
    const allModels = await vscode.lm.selectChatModels({});
    if (allModels.length > 0) {
      return new VsCodeLmProvider();
    }
  } catch {
    // Ignore errors
  }
  // Otherwise use RuleBasedProvider
  return new RuleBasedProvider();
}

