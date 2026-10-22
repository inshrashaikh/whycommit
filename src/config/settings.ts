// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';

export type ProviderId =
  'anthropic' | 'openai' | 'gemini' | 'groq' | 'openrouter' | 'opencode' | 'ollama' | 'custom';

export type OutputLanguage = 'english' | 'hinglish';

export interface WhycommitConfig {
  /** Provider used to generate the commit message. */
  provider: ProviderId;
  /** Model id as configured by the user (may be empty => provider default). */
  model: string;
  /** Base URL as configured by the user (may be empty => provider default). */
  baseUrl: string;
  /** Approximate token budget for the staged diff. */
  maxDiffTokens: number;
  /** Language of the generated message. */
  language: OutputLanguage;
  /** Sampling temperature. */
  temperature: number;
  /** Upper bound for the generated message length. */
  maxOutputTokens: number;
  /** How many recent commits are used as a style reference. */
  recentCommitCount: number;
  /** Whether the status bar item is visible. */
  showStatusBar: boolean;
  /** How often a failed request is retried. */
  maxRetries: number;
}

export interface ProviderPreset {
  /** Stable id of the preset. */
  id: ProviderId;
  /** Human readable provider name. */
  label: string;
  /** Model used when the user did not configure one. */
  defaultModel: string;
  /** Base URL used when the user did not configure one. */
  defaultBaseUrl: string;
  /** Whether a secret API key is required. */
  requiresApiKey: boolean;
  /** True when the request never leaves the machine. */
  isLocal: boolean;
  /** Short hint shown in the UI. */
  hint: string;
}

export const CONFIG_SECTION = 'whycommit';

/**
 * The catalogue of supported providers.
 *
 * Every preset except `custom` fills in a base URL and a default model, so
 * switching the provider is a single click. `custom` is an escape hatch for
 * any other OpenAI-compatible endpoint.
 */
export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-5',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    isLocal: false,
    hint: 'The default provider. Requires an Anthropic API key.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    isLocal: false,
    hint: 'OpenAI Chat Completions API.',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresApiKey: true,
    isLocal: false,
    hint: 'Gemini through its OpenAI-compatible endpoint.',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    isLocal: false,
    hint: 'Very fast inference for open weight models.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'anthropic/claude-sonnet-4.5',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    isLocal: false,
    hint: 'A router that fronts many different models.',
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode Zen',
    defaultModel: 'claude-sonnet-4-5',
    defaultBaseUrl: 'https://opencode.ai/zen/v1',
    requiresApiKey: true,
    isLocal: false,
    hint: 'OpenCode Zen gateway (OpenAI-compatible).',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultModel: 'llama3.2',
    defaultBaseUrl: 'http://localhost:11434',
    requiresApiKey: false,
    isLocal: true,
    hint: 'Runs a local model, so nothing leaves your machine.',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    defaultModel: '',
    defaultBaseUrl: '',
    requiresApiKey: true,
    isLocal: false,
    hint: 'Any endpoint that implements POST {baseUrl}/chat/completions.',
  },
};

/** The provider ids in the order they are shown in the picker. */
export const PROVIDER_ORDER: ProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'groq',
  'openrouter',
  'opencode',
  'ollama',
  'custom',
];

export const LANGUAGE_LABELS: Record<OutputLanguage, string> = {
  english: 'English',
  hinglish: 'Hinglish (Romanized Hindi mixed with English)',
};

function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in PROVIDER_PRESETS;
}

function isLanguage(value: unknown): value is OutputLanguage {
  return value === 'english' || value === 'hinglish';
}

/** Reads the current Whycommit configuration from the workspace/user settings. */
export function getConfig(): WhycommitConfig {
  const section = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const rawProvider = section.get<string>('provider');
  const rawLanguage = section.get<string>('language');

  return {
    provider: isProvider(rawProvider) ? rawProvider : 'anthropic',
    model: section.get<string>('model', '').trim(),
    baseUrl: section.get<string>('baseUrl', '').trim(),
    maxDiffTokens: Math.max(500, section.get<number>('maxDiffTokens', 12000)),
    language: isLanguage(rawLanguage) ? rawLanguage : 'english',
    temperature: clamp(section.get<number>('temperature', 0.3), 0, 2),
    maxOutputTokens: clamp(section.get<number>('maxOutputTokens', 512), 64, 8192),
    recentCommitCount: clamp(section.get<number>('recentCommitCount', 10), 0, 50),
    showStatusBar: section.get<boolean>('showStatusBar', true),
    maxRetries: clamp(section.get<number>('maxRetries', 2), 0, 5),
  };
}

/** Returns the effective model id for a provider. */
export function resolveModel(config: WhycommitConfig): string {
  return config.model || PROVIDER_PRESETS[config.provider].defaultModel;
}

/** Returns the effective base URL for a provider. */
export function resolveBaseUrl(config: WhycommitConfig): string {
  return (config.baseUrl || PROVIDER_PRESETS[config.provider].defaultBaseUrl).replace(/\/+$/, '');
}

/** Returns the provider display name. */
export function providerLabel(provider: ProviderId): string {
  return PROVIDER_PRESETS[provider].label;
}

/** Returns true when the provider needs an API key to work. */
export function providerRequiresApiKey(provider: ProviderId): boolean {
  return PROVIDER_PRESETS[provider].requiresApiKey;
}

/** Returns true when the provider runs on the local machine. */
export function providerIsLocal(provider: ProviderId): boolean {
  return PROVIDER_PRESETS[provider].isLocal;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
