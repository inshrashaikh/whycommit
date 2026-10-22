// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';
import type { CompletionRequest, LlmProvider, ProviderOptions, ProviderResult } from './provider';
import { ProviderError } from './provider';

export class VsCodeLmProvider implements LlmProvider {
  readonly id = 'vscode-lm' as const;
  readonly displayName = 'VS Code Language Models (Copilot)';
  readonly requiresApiKey = false;

  async generate(request: CompletionRequest, _options: ProviderOptions): Promise<ProviderResult> {
    try {
      // Try to select a model
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      if (models.length === 0) {
        // Try any available model
        const allModels = await vscode.lm.selectChatModels({});
        if (allModels.length === 0) {
          throw new ProviderError('unknown', 'No VS Code language models available. Sign in to GitHub Copilot or configure a model.');
        }
        const model = allModels[0];
        const messages = [
          vscode.LanguageModelChatMessage.User(request.system + '\n\n' + request.user),
        ];
        const response = await model.sendRequest(messages, {});
        let text = '';
        for await (const chunk of response.text) {
          text += chunk;
        }
        if (!text.trim()) {
          throw new ProviderError('empty-response', 'The VS Code language model returned an empty response.');
        }
        return {
          text: text.trim(),
          model: model.id || 'vscode-lm',
        };
      }

      const model = models[0];
      const messages = [
        vscode.LanguageModelChatMessage.User(request.system + '\n\n' + request.user),
      ];
      const response = await model.sendRequest(messages, {});
      let text = '';
      for await (const chunk of response.text) {
        text += chunk;
      }
      if (!text.trim()) {
        throw new ProviderError('empty-response', 'The VS Code language model returned an empty response.');
      }
      return {
        text: text.trim(),
        model: model.id || 'vscode-lm-copilot',
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes('cancel')) {
          throw new ProviderError('cancelled', 'The request was cancelled.', { cause: error });
        }
        throw new ProviderError('unknown', `VS Code LM error: ${error.message}`, { cause: error });
      }
      throw new ProviderError('unknown', 'VS Code LM error.', { cause: error });
    }
  }
}
