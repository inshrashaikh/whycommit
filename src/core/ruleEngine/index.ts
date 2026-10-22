// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import type { RuleEngineInput, RuleEngineOutput } from './types';
import { parseStagedDiff } from './diffParser';
import { selectPrimaryType, detectScope } from './classifier';
import { buildMessage } from './messageBuilder';

export function runRuleEngine(input: RuleEngineInput): RuleEngineOutput {
  // If files already parsed, use them; otherwise parse
  const files = input.files.length > 0 ? input.files : parseStagedDiff(input.rawDiff);

  if (files.length === 0) {
    // Empty diff case
    return {
      subject: 'chore: update repository',
      body: '',
      fullMessage: 'chore: update repository',
      type: 'chore',
      confidence: 0.3,
      engine: 'rulebased',
    };
  }

  const type = selectPrimaryType(files);
  const scope = detectScope(files);

  return buildMessage({ ...input, files }, type, scope);
}

export { parseStagedDiff } from './diffParser';
export { classifyFile, selectPrimaryType, detectScope } from './classifier';
export { buildMessage } from './messageBuilder';
export { extractSymbols } from './symbolParser';
export type * from './types';
