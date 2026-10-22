// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import type { CompletionRequest, LlmProvider, ProviderOptions, ProviderResult } from './provider';
import { runRuleEngine } from '../core/ruleEngine';
import { parseStagedDiff } from '../core/ruleEngine/diffParser';
import type { OutputLanguage } from '../config/settings';

export class RuleBasedProvider implements LlmProvider {
  readonly id = 'rulebased' as const;
  readonly displayName = 'Rule-based (offline)';
  readonly requiresApiKey = false;

  async generate(request: CompletionRequest, _options: ProviderOptions): Promise<ProviderResult> {
    // Try to extract context from the user message if possible
    // The user message contains the diff and other context
    const userMessage = request.user;
    
    // Parse diff from user message
    let rawDiff = '';
    const diffMatch = userMessage.match(/```diff\n([\s\S]*?)```/);
    if (diffMatch) {
      rawDiff = diffMatch[1];
    } else {
      // Try to find diff content
      const stagedMatch = userMessage.match(/Staged diff:[\s\S]*?(?=\n\n[A-Z]|\nRecent commits:|$)/i);
      if (stagedMatch) {
        rawDiff = stagedMatch[0].replace(/Staged diff:/i, '').trim();
      }
    }

    const files = parseStagedDiff(rawDiff);
    
    // Extract why if present
    let why: string | undefined;
    const whyMatch = userMessage.match(/Why:\s*([^\n]+)/i);
    if (whyMatch) {
      why = whyMatch[1];
    }

    // Extract language
    let language: OutputLanguage = 'english';
    if (/hinglish/i.test(userMessage)) {
      language = 'hinglish';
    }

    const result = runRuleEngine({
      rawDiff,
      files,
      branch: '',
      recentCommits: [],
      language,
      why,
      commitrc: null,
      repoStyle: null,
    });

    return {
      text: result.fullMessage,
      model: 'rule-based',
    };
  }
}
