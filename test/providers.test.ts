// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../src/llm/anthropic';
import { OllamaProvider } from '../src/llm/ollama';
import { OpenAICompatibleProvider } from '../src/llm/openaiCompatible';
import { ProviderError } from '../src/llm/provider';

const REQUEST = { system: 'system prompt', user: 'user prompt' };

function jsonResponse(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
  };
}

function rawResponse(text: string, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => text,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AnthropicProvider', () => {
  const provider = new AnthropicProvider();

  it('sends the prompt and returns the generated text', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: 'feat(api): add the thing' }],
      }),
    );

    const result = await provider.generate(REQUEST, {
      model: 'claude-sonnet-4-5',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
    });

    expect(result.text).toBe('feat(api): add the thing');
    expect(result.model).toBe('claude-sonnet-4-5');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(init.body).system).toBe('system prompt');
  });

  it('fails without an API key', async () => {
    await expect(
      provider.generate(REQUEST, { model: 'claude', baseUrl: 'https://api.anthropic.com/v1' }),
    ).rejects.toThrow(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 401 to an unauthorized error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'invalid key' } }, 401));

    await expect(
      provider.generate(REQUEST, {
        model: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('maps a 429 to a rate limit error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'slow down' } }, 429));

    await expect(
      provider.generate(REQUEST, {
        model: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toMatchObject({ kind: 'rate-limit' });
  });

  it('maps a 500 to a server error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'boom' } }, 500));

    await expect(
      provider.generate(REQUEST, {
        model: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toMatchObject({ kind: 'server' });
  });

  it('maps a network failure to a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      provider.generate(REQUEST, {
        model: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('fails on an empty response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'claude', content: [] }));

    await expect(
      provider.generate(REQUEST, {
        model: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toMatchObject({ kind: 'empty-response' });
  });

  it('fails on malformed JSON', async () => {
    fetchMock.mockResolvedValue(rawResponse('{not json'));

    await expect(
      provider.generate(REQUEST, {
        model: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toMatchObject({ kind: 'empty-response' });
  });

  it('joins several text blocks', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        content: [
          { type: 'text', text: 'feat: one' },
          { type: 'tool_use', id: 'x' },
          { type: 'text', text: 'feat: two' },
        ],
      }),
    );

    const result = await provider.generate(REQUEST, {
      model: 'claude',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
    });

    expect(result.text).toBe('feat: one\nfeat: two');
  });
});

describe('OpenAICompatibleProvider', () => {
  const provider = new OpenAICompatibleProvider();

  it('sends the prompt and returns the generated text', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'gpt-4o',
        choices: [{ message: { role: 'assistant', content: 'fix: correct the thing' } }],
      }),
    );

    const result = await provider.generate(REQUEST, {
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    });

    expect(result.text).toBe('fix: correct the thing');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer sk-test');
  });

  it('works against a custom base URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'chore: x' } }] }));

    await provider.generate(REQUEST, {
      model: 'my-model',
      baseUrl: 'https://opencode.ai/zen/v1',
      apiKey: 'sk-test',
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://opencode.ai/zen/v1/chat/completions');
  });

  it('fails without an API key', async () => {
    await expect(
      provider.generate(REQUEST, { model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' }),
    ).rejects.toMatchObject({ kind: 'no-api-key' });
  });

  it('fails on an empty choice', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));

    await expect(
      provider.generate(REQUEST, {
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      }),
    ).rejects.toMatchObject({ kind: 'empty-response' });
  });

  it('fails on a null content', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: null } }] }));

    await expect(
      provider.generate(REQUEST, {
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      }),
    ).rejects.toMatchObject({ kind: 'empty-response' });
  });

  it('fails on malformed JSON', async () => {
    fetchMock.mockResolvedValue(rawResponse('<html>502</html>', 200));

    await expect(
      provider.generate(REQUEST, {
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      }),
    ).rejects.toMatchObject({ kind: 'empty-response' });
  });

  it('retries with max_completion_tokens when the server rejects max_tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: "Unsupported parameter: 'max_tokens' is not supported." } },
          400,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ model: 'gpt-5', choices: [{ message: { content: 'feat: x' } }] }),
      );

    const result = await provider.generate(REQUEST, {
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    });

    expect(result.text).toBe('feat: x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_completion_tokens).toBe(512);
  });

  it('does not retry a 400 that is unrelated to max_tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'bad model' } }, 400));

    await expect(
      provider.generate(REQUEST, {
        model: 'nope',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      }),
    ).rejects.toMatchObject({ kind: 'unknown' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('OllamaProvider', () => {
  const provider = new OllamaProvider();

  it('sends the prompt to the local server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'llama3.2',
        message: { role: 'assistant', content: 'docs: update the readme' },
        done: true,
      }),
    );

    const result = await provider.generate(REQUEST, {
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
    });

    expect(result.text).toBe('docs: update the readme');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(false);
  });

  it('works without an API key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: { content: 'chore: x' } }));

    const result = await provider.generate(REQUEST, {
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
    });

    expect(result.text).toBe('chore: x');
  });

  it('fails when the local server is not running', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      provider.generate(REQUEST, { model: 'llama3.2', baseUrl: 'http://localhost:11434' }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('fails on an empty response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: { content: '' } }));

    await expect(
      provider.generate(REQUEST, { model: 'llama3.2', baseUrl: 'http://localhost:11434' }),
    ).rejects.toMatchObject({ kind: 'empty-response' });
  });
});

describe('createProvider', () => {
  it('routes every OpenAI-compatible preset to the same implementation', async () => {
    const { createProvider } = await import('../src/llm/provider');
    for (const id of ['openai', 'gemini', 'groq', 'openrouter', 'opencode', 'custom'] as const) {
      expect(createProvider(id)).toBeInstanceOf(OpenAICompatibleProvider);
    }
  });

  it('routes Anthropic and Ollama to their own implementation', async () => {
    const { createProvider } = await import('../src/llm/provider');
    expect(createProvider('anthropic')).toBeInstanceOf(AnthropicProvider);
    expect(createProvider('ollama')).toBeInstanceOf(OllamaProvider);
  });
});
