// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';

export type ProviderId = 'anthropic' | 'openai' | 'ollama';

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
}

export interface ProviderPreset {
  /** Human readable provider name. */
  label: string;
  /** Model used when the user did not configure one. */
  defaultModel: string;
  /** Base URL used when the user did not configure one. */
  defaultBaseUrl: string;
  /** Whether a secret API key is required. */
  requiresApiKey: boolean;
  /** Short hint shown in the UI. */
  hint: string;
}

export const CONFIG_SECTION = 'whycommit';

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-5',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    hint: 'Requires an Anthropic API key',
  },
  openai: {
    label: 'OpenAI / OpenAI-compatible',
    defaultModel: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    hint: 'Works with OpenAI and any OpenAI-compatible baseUrl',
  },
  ollama: {
    label: 'Ollama (local)',
    defaultModel: 'llama3.2',
    defaultBaseUrl: 'http://localhost:11434',
    requiresApiKey: false,
    hint: 'Runs a local model, usually without an API key',
  },
};

export const LANGUAGE_LABELS: Record<OutputLanguage, string> = {
  english: 'English',
  hinglish: 'Hinglish (Romanized Hindi mixed with English)',
};

function isProvider(value: unknown): value is ProviderId {
  return value === 'anthropic' || value === 'openai' || value === 'ollama';
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
