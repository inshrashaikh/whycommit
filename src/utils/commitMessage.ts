// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Cleans up a raw model response so it can be dropped into the SCM input box.
 *
 * Models sometimes wrap the answer in code fences, add a preamble or surround
 * the message with quotes. None of that belongs in a commit message.
 */
export function sanitizeCommitMessage(raw: string): string {
  let text = raw.trim();

  // Remove a single leading/trailing code fence block.
  const fence = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/);
  if (fence) {
    text = fence[1].trim();
  }

  // Remove wrapping quotes.
  const quoted = text.match(/^["'`]([\s\S]*)["'`]$/);
  if (quoted) {
    text = quoted[1].trim();
  }

  // Strip a leading "Commit message:" style preamble.
  text = text.replace(/^(commit\s*message|commit)\s*:\s*/i, '');

  // Collapse more than one blank line into a single blank line.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
