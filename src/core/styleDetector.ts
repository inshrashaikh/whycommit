// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Detects the commit message style that a repository already uses so the
 * generated message blends in instead of fighting the existing history.
 */

export type CommitStyle = 'conventional' | 'angular' | 'gitmoji' | 'plain' | 'unknown';

/** The Conventional Commits types that are recognised by default. */
export const CONVENTIONAL_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
] as const;

/** The types that the Angular commit guideline uses. */
export const ANGULAR_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'style',
  'test',
] as const;

const CONVENTIONAL_PATTERN = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;
const GITMOJI_PATTERN = /^:([a-z0-9_+-]+):\s*(.*)$/i;

export interface StyleDetection {
  /** The detected style. */
  style: CommitStyle;
  /** How confident the detector is, between 0 and 1. */
  confidence: number;
  /** How many subjects were inspected. */
  sampleSize: number;
  /** The commit types that were observed. */
  types: string[];
  /** The scopes that were observed. */
  scopes: string[];
  /** True when at least one message was flagged as a breaking change. */
  hasBreakingChanges: boolean;
}

/**
 * Detects the commit style from a list of commit subjects (first lines).
 *
 * @param subjects  Commit subjects, newest first.
 */
export function detectStyle(subjects: string[]): StyleDetection {
  const samples = subjects.map((subject) => subject.trim()).filter((subject) => subject.length > 0);

  const result: StyleDetection = {
    style: 'unknown',
    confidence: 0,
    sampleSize: samples.length,
    types: [],
    scopes: [],
    hasBreakingChanges: false,
  };

  if (samples.length === 0) {
    return result;
  }

  const types = new Set<string>();
  const scopes = new Set<string>();
  let conventionalHits = 0;
  let angularHits = 0;
  let gitmojiHits = 0;
  let breakingChanges = 0;

  for (const subject of samples) {
    const gitmoji = subject.match(GITMOJI_PATTERN);
    if (gitmoji) {
      gitmojiHits += 1;
      continue;
    }

    const match = subject.match(CONVENTIONAL_PATTERN);
    if (!match) {
      continue;
    }

    const type = match[1];
    const scope = match[2];
    const breaking = match[3] === '!';

    if (breaking) {
      breakingChanges += 1;
    }
    if (scope) {
      scopes.add(scope);
    }

    if ((CONVENTIONAL_TYPES as readonly string[]).includes(type)) {
      types.add(type);
      if (scope) {
        conventionalHits += 1;
      } else {
        angularHits += 1;
      }
    }
  }

  result.hasBreakingChanges = breakingChanges > 0;

  const total = samples.length;

  if (gitmojiHits / total >= 0.5) {
    result.style = 'gitmoji';
    result.confidence = gitmojiHits / total;
  } else if (conventionalHits + angularHits > 0) {
    const structuredHits = conventionalHits + angularHits;
    // A scope is the strongest signal for Conventional Commits, because the
    // Angular guideline almost never uses one.
    const style: CommitStyle = conventionalHits >= angularHits ? 'conventional' : 'angular';
    result.style = style;
    result.confidence = structuredHits / total;
  } else {
    result.style = 'plain';
    result.confidence = 1 - gitmojiHits / total;
  }

  result.types = [...types].sort();
  result.scopes = [...scopes].sort();

  return result;
}

/** Returns the instruction that describes the detected style for the prompt. */
export function describeStyle(detection: StyleDetection): string {
  switch (detection.style) {
    case 'conventional':
      return 'The repository uses Conventional Commits with scopes. Use the same <type>(<scope>): <subject> shape and reuse the scopes that already appear in the history.';
    case 'angular':
      return 'The repository uses Angular style commit headers. Use <type>: <subject> without a scope.';
    case 'gitmoji':
      return 'The repository uses gitmoji prefixes. Start the message with a fitting gitmoji.';
    case 'plain':
      return 'The repository uses plain, unprefixed commit messages. Write a short imperative subject without a type prefix.';
    default:
    case 'unknown':
      return 'No commit history is available. Use Conventional Commits: <type>(<optional scope>): <subject>.';
  }
}
