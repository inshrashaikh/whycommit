// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getConfig,
  PROVIDER_ORDER,
  PROVIDER_PRESETS,
  providerIsLocal,
  providerLabel,
  providerRequiresApiKey,
  resolveBaseUrl,
  resolveModel,
} from '../src/config/settings';
import { resetConfiguration, setConfiguration } from './mocks/vscode';

beforeEach(() => {
  resetConfiguration();
});

afterEach(() => {
  resetConfiguration();
});

describe('provider presets', () => {
  it('ships a preset for every documented provider', () => {
    for (const id of [
      'anthropic',
      'openai',
      'gemini',
      'groq',
      'openrouter',
      'opencode',
      'ollama',
      'custom',
    ] as const) {
      expect(PROVIDER_PRESETS[id]).toBeDefined();
      expect(PROVIDER_PRESETS[id].label.length).toBeGreaterThan(0);
    }
  });

  it('lists every preset in the picker order', () => {
    expect(PROVIDER_ORDER).toHaveLength(Object.keys(PROVIDER_PRESETS).length);
    expect(PROVIDER_ORDER[0]).toBe('auto');
    expect(PROVIDER_ORDER).toContain('custom');
  });

  it('fills in the OpenCode Zen endpoint', () => {
    expect(PROVIDER_PRESETS.opencode.defaultBaseUrl).toBe('https://opencode.ai/zen/v1');
  });

  it('uses the OpenAI-compatible endpoint for Gemini', () => {
    expect(PROVIDER_PRESETS.gemini.defaultBaseUrl).toContain('generativelanguage.googleapis.com');
  });

  it('marks Ollama as local and everything else as a cloud provider', () => {
    expect(providerIsLocal('ollama')).toBe(true);
    expect(providerIsLocal('anthropic')).toBe(false);
    expect(providerIsLocal('custom')).toBe(false);
  });

  it('does not require an API key for Ollama', () => {
    expect(providerRequiresApiKey('ollama')).toBe(false);
    expect(providerRequiresApiKey('anthropic')).toBe(true);
  });

  it('has a default model for every preset except custom', () => {
    for (const id of PROVIDER_ORDER) {
      if (id === 'custom' || id === 'auto' || id === 'rulebased' || id === 'vscode-lm') {
        expect(PROVIDER_PRESETS[id].defaultModel).toBeDefined();
      } else {
        expect(PROVIDER_PRESETS[id].defaultModel.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns a display name', () => {
    expect(providerLabel('ollama')).toBe('Ollama (local)');
  });
});

describe('getConfig', () => {
  it('falls back to Anthropic for an unknown provider', () => {
    setConfiguration('whycommit', { provider: 'not-a-provider' });
    expect(getConfig().provider).toBe('anthropic');
  });

  it('reads the configured values', () => {
    setConfiguration('whycommit', {
      provider: 'ollama',
      model: 'qwen2.5',
      baseUrl: 'http://localhost:1234/',
      maxDiffTokens: 4000,
      language: 'hinglish',
      temperature: 0.7,
      maxOutputTokens: 256,
      recentCommitCount: 5,
      showStatusBar: false,
      maxRetries: 3,
    });

    const config = getConfig();
    expect(config.provider).toBe('ollama');
    expect(config.model).toBe('qwen2.5');
    expect(config.baseUrl).toBe('http://localhost:1234/');
    expect(config.maxDiffTokens).toBe(4000);
    expect(config.language).toBe('hinglish');
    expect(config.temperature).toBe(0.7);
    expect(config.maxOutputTokens).toBe(256);
    expect(config.recentCommitCount).toBe(5);
    expect(config.showStatusBar).toBe(false);
    expect(config.maxRetries).toBe(3);
  });

  it('clamps out of range values', () => {
    setConfiguration('whycommit', {
      maxDiffTokens: 1,
      temperature: 99,
      maxOutputTokens: 100_000,
      recentCommitCount: -5,
      maxRetries: 50,
    });

    const config = getConfig();
    expect(config.maxDiffTokens).toBe(500);
    expect(config.temperature).toBe(2);
    expect(config.maxOutputTokens).toBe(8192);
    expect(config.recentCommitCount).toBe(0);
    expect(config.maxRetries).toBe(5);
  });

  it('uses sensible defaults', () => {
    const config = getConfig();
    expect(config.provider).toBe('anthropic');
    expect(config.language).toBe('english');
    expect(config.maxDiffTokens).toBe(12000);
    expect(config.maxRetries).toBe(2);
  });
});

describe('resolveModel and resolveBaseUrl', () => {
  it('falls back to the preset defaults', () => {
    setConfiguration('whycommit', { provider: 'groq' });
    const config = getConfig();

    expect(resolveModel(config)).toBe(PROVIDER_PRESETS.groq.defaultModel);
    expect(resolveBaseUrl(config)).toBe(PROVIDER_PRESETS.groq.defaultBaseUrl);
  });

  it('prefers the explicit configuration', () => {
    setConfiguration('whycommit', {
      provider: 'groq',
      model: 'my-model',
      baseUrl: 'https://example.com/v1',
    });
    const config = getConfig();

    expect(resolveModel(config)).toBe('my-model');
    expect(resolveBaseUrl(config)).toBe('https://example.com/v1');
  });

  it('removes a trailing slash from the base URL', () => {
    setConfiguration('whycommit', { provider: 'openai', baseUrl: 'https://example.com/v1/' });
    expect(resolveBaseUrl(getConfig())).toBe('https://example.com/v1');
  });

  it('returns an empty base URL for custom without a configuration', () => {
    setConfiguration('whycommit', { provider: 'custom' });
    expect(resolveBaseUrl(getConfig())).toBe('');
    expect(resolveModel(getConfig())).toBe('');
  });
});
