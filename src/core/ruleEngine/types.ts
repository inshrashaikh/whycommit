// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

export type OutputLanguage = 'english' | 'hinglish';

export type CommitType =
  | 'feat'
  | 'fix'
  | 'docs'
  | 'style'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'build'
  | 'ci'
  | 'chore'
  | 'revert';

export type CommitStyleKind = 'conventional' | 'non-conventional' | 'gitmoji' | 'unknown';

export interface CommitrcRules {
  allowedTypes?: string[];
  allowedScopes?: string[];
  maxSubjectLength?: number;
  signOff?: boolean;
  language?: OutputLanguage;
}

export interface RepoStyle {
  kind: CommitStyleKind;
  usesEmoji: boolean;
  casing: 'lower' | 'sentence' | 'upper' | 'unknown';
  tense: 'imperative' | 'past' | 'present' | 'unknown';
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  addedLines: string[];
  removedLines: string[];
  hunks: string[];
  isBinary: boolean;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'component' | 'method' | 'export' | 'variable';
  language: string;
}

export interface RuleEngineInput {
  rawDiff: string;
  files: FileChange[];
  branch: string;
  recentCommits: string[];
  language: OutputLanguage;
  why?: string;
  commitrc?: CommitrcRules | null;
  repoStyle?: RepoStyle | null;
}

export interface RuleEngineOutput {
  subject: string;
  body: string;
  fullMessage: string;
  type: CommitType;
  scope?: string;
  confidence: number;
  engine: 'rulebased';
}

export interface FileGroup {
  folder: string;
  type: CommitType;
  files: FileChange[];
}
