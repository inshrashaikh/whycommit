// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import type { CommitType, FileChange } from './types';
import { extname } from 'path';

const DOC_EXTS = new Set(['.md', '.mdx', '.rst', '.txt']);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /\/test\//, /\/tests\//, /__tests__\//];
const CI_PATTERNS = [/\.github\/workflows\//, /\.gitlab-ci/, /\.circleci\//, /azure-pipelines/, /Jenkinsfile/];
const BUILD_PATTERNS = [
  /package\.json$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /go\.mod$/,
  /go\.sum$/,
  /Cargo\.toml$/,
  /Cargo\.lock$/,
  /pyproject\.toml$/,
  /poetry\.lock$/,
  /Pipfile\.lock$/,
  /tsconfig.*\.json$/,
  /webpack\.config/,
  /vite\.config/,
  /rollup\.config/,
  /esbuild/,
  /Makefile$/,
  /CMakeLists\.txt$/,
  /Dockerfile$/,
  /docker-compose/,
];
const CONFIG_PATTERNS = [/\.gitignore$/, /\.npmignore$/, /\.eslintrc/, /\.prettierrc/, /\.editorconfig$/, /\.vscodeignore$/, /config\//];

function matchesAny(path: string, patterns: RegExp[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  return patterns.some((pattern) => pattern.test(normalized));
}

function looksLikeDocs(path: string): boolean {
  const ext = extname(path).toLowerCase();
  const normalized = path.replace(/\\/g, '/');
  if (DOC_EXTS.has(ext)) {
    return true;
  }
  return /\/docs\//.test(normalized);
}

function looksLikeTest(path: string): boolean {
  return matchesAny(path, TEST_PATTERNS);
}

function looksLikeCi(path: string): boolean {
  return matchesAny(path, CI_PATTERNS);
}

function looksLikeBuild(path: string): boolean {
  return matchesAny(path, BUILD_PATTERNS);
}

function looksLikeConfig(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (matchesAny(normalized, CONFIG_PATTERNS)) {
    return true;
  }
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) {
    return true;
  }
  return false;
}

function hasFixKeywords(added: string[], removed: string[]): boolean {
  const text = [...added, ...removed].join(' ').toLowerCase();
  if (/(^|\b)(fix|bug|error|crash|regression|null check|null-pointer|undefined|nullish)(\b|$)/.test(text)) {
    return true;
  }
  if (/\bcatch\b.*\berror\b|\bif\s*\(!|===\s*null|==\s*null|\?\.|\?\?/.test(text)) {
    return true;
  }
  return false;
}

function looksLikeRefactor(added: string[], removed: string[]): boolean {
  if (added.length === 0 || removed.length === 0) {
    return false;
  }
  // Similar count of additions and removals often indicates refactor
  const ratio = added.length / Math.max(1, removed.length);
  if (ratio > 0.5 && ratio < 2.0 && added.length > 2 && removed.length > 2) {
    return true;
  }
  return false;
}

function hasOnlyWhitespace(added: string[], removed: string[]): boolean {
  const addedNonWs = added.filter((l) => l.trim().length > 0);
  const removedNonWs = removed.filter((l) => l.trim().length > 0);
  return addedNonWs.length === 0 && removedNonWs.length === 0 && (added.length > 0 || removed.length > 0);
}

export function classifyFile(file: FileChange): CommitType {
  if (file.isBinary) {
    return 'chore';
  }

  if (looksLikeDocs(file.path)) {
    return 'docs';
  }
  if (looksLikeTest(file.path)) {
    return 'test';
  }
  if (looksLikeCi(file.path)) {
    return 'ci';
  }
  if (looksLikeBuild(file.path)) {
    return 'build';
  }
  if (looksLikeConfig(file.path) && !/\.(ts|js|tsx|jsx|py|go|java|cs|php)$/.test(file.path)) {
    return 'chore';
  }

  if (hasOnlyWhitespace(file.addedLines, file.removedLines)) {
    return 'style';
  }

  if (file.status === 'added') {
    // New files could be feat, but could also be tests/docs - already handled
    // Check if it's adding substantial code
    const addedContent = file.addedLines.filter((l) => l.trim().length > 0).length;
    if (addedContent > 3) {
      return 'feat';
    }
  }

  if (hasFixKeywords(file.addedLines, file.removedLines)) {
    return 'fix';
  }

  if (looksLikeRefactor(file.addedLines, file.removedLines) && file.status === 'modified') {
    return 'refactor';
  }

  if (file.status === 'modified') {
    return 'fix'; // default for modified existing code
  }

  if (file.status === 'added') {
    return 'feat';
  }

  return 'chore';
}

export function detectScope(files: FileChange[]): string | undefined {
  if (files.length === 0) {
    return undefined;
  }

  const folders = new Set<string>();
  for (const file of files) {
    const normalized = file.path.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length >= 2) {
      // Use top-level folder
      const topLevel = parts[0];
      if (topLevel !== '.' && !topLevel.startsWith('.')) {
        folders.add(topLevel);
      } else if (parts.length >= 3) {
        folders.add(parts[1]);
      }
    }
  }

  // If files span many folders, omit scope
  if (folders.size > 2) {
    return undefined;
  }
  if (folders.size === 1) {
    return Array.from(folders)[0];
  }
  return undefined;
}

export function selectPrimaryType(files: FileChange[]): CommitType {
  if (files.length === 0) {
    return 'chore';
  }

  // Priority order for mixed changes
  const priority: CommitType[] = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'style', 'chore'];
  const types = files.map((f) => classifyFile(f));
  
  // If all same type, return it
  const unique = Array.from(new Set(types));
  if (unique.length === 1) {
    return unique[0];
  }

  // Check if it's mostly one type
  for (const p of priority) {
    const count = types.filter((t) => t === p).length;
    if (count > 0 && count >= files.length * 0.5) {
      return p;
    }
  }

  // For mixed changes, prefer feat/fix over docs/chore
  if (types.includes('feat')) return 'feat';
  if (types.includes('fix')) return 'fix';
  if (types.includes('refactor')) return 'refactor';
  
  return types[0] || 'chore';
}
