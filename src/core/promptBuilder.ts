// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { LANGUAGE_LABELS, type OutputLanguage } from '../config/settings';
import type { ProcessedDiff } from './diffProcessor';
import type { CompletionRequest } from '../llm/provider';

import commitTemplate from './prompts/commit.txt';
import systemTemplate from './prompts/system.txt';

export interface CommitPromptContext {
  /** The processed staged diff. */
  diff: ProcessedDiff;
  /** Name of the branch that is currently checked out. */
  branch: string;
  /** Recent commit subjects used as a style reference. */
  recentCommits: string[];
  /** Language the message should be written in. */
  language: OutputLanguage;
}

/**
 * Renders the prompt templates. The templates live in `src/core/prompts` as
 * plain text files and are inlined into the bundle at build time.
 */
export class PromptBuilder {
  build(context: CommitPromptContext): CompletionRequest {
    const recentCommits =
      context.recentCommits.length > 0
        ? context.recentCommits.map((subject) => `- ${subject}`).join('\n')
        : '- (no commit history available)';

    return {
      system: render(stripFileHeader(systemTemplate), {}),
      user: render(stripFileHeader(commitTemplate), {
        branch: context.branch || 'unknown',
        language: LANGUAGE_LABELS[context.language] ?? LANGUAGE_LABELS.english,
        recentCommits,
        diff: context.diff.text,
      }),
    };
  }
}

/**
 * Removes the leading copyright header of a plain text template.
 *
 * The templates are plain text files, so their header uses the `;` marker.
 * The header is stripped before the template is sent to a model.
 */
export function stripFileHeader(template: string): string {
  const lines = template.split('\n');
  let index = 0;
  while (index < lines.length && lines[index].trimStart().startsWith(';')) {
    index += 1;
  }
  return lines.slice(index).join('\n').replace(/^\s+/, '');
}

/** Replaces `{{placeholders}}` in a template with the given values. */
export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key] ?? '');
}
