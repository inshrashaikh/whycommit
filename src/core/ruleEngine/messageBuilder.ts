// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import type { CommitType, CommitrcRules, FileChange, OutputLanguage, RuleEngineInput, RuleEngineOutput } from './types';
import { basename, dirname } from 'path';
import { extractSymbols } from './symbolParser';

function getBasename(path: string): string {
  return basename(path.replace(/\\/g, '/'));
}

function getDirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const dir = dirname(normalized);
  return dir === '.' ? '' : dir.split('/').pop() || '';
}

function truncateToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

function applyCommitrc(subject: string, type: CommitType, scope: string | undefined, commitrc: CommitrcRules | null | undefined): string {
  if (!commitrc) {
    return subject;
  }

  let result = subject;
  if (commitrc.allowedTypes && commitrc.allowedTypes.length > 0 && !commitrc.allowedTypes.includes(type)) {
    const fallback = commitrc.allowedTypes[0];
    result = result.replace(new RegExp('^' + type + ':'), fallback + ':');
  }
  if (scope && commitrc.allowedScopes && commitrc.allowedScopes.length > 0 && !commitrc.allowedScopes.includes(scope)) {
    result = result.replace(new RegExp('^([a-z]+)\\(' + scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\):'), '$1:');
  }
  if (commitrc.maxSubjectLength && result.length > commitrc.maxSubjectLength) {
    result = truncateToLength(result, commitrc.maxSubjectLength);
  }
  return result;
}

function buildSubjectEnglish(type: CommitType, scope: string | undefined, files: FileChange[]): string {
  const mainFile = files[0];
  if (files.length === 1) {
    const file = mainFile;
    const name = getBasename(file.path);
    const dir = getDirname(file.path);
    const symbols = extractSymbols(file.path, [...file.addedLines, ...file.removedLines]);

    if (type === 'feat') {
      if (symbols.length > 0) {
        const symbolNames = symbols.slice(0, 2).map((s) => s.name).join(' and ');
        if (file.status === 'added') {
          return scope ? 'feat(' + scope + '): add ' + symbolNames : 'feat: add ' + symbolNames;
        }
        return scope ? 'feat(' + scope + '): update ' + symbolNames : 'feat: update ' + symbolNames;
      }
      if (file.status === 'added') {
        return scope ? 'feat(' + scope + '): add ' + name : 'feat: add ' + name;
      }
      return scope ? 'feat(' + scope + '): update ' + name : 'feat: update ' + name;
    }

    if (type === 'fix') {
      if (symbols.length > 0) {
        const symbolNames = symbols.slice(0, 2).map((s) => s.name).join(' and ');
        return scope ? 'fix(' + scope + '): fix ' + symbolNames : 'fix: fix ' + symbolNames;
      }
      return scope ? 'fix(' + scope + '): fix ' + name : 'fix: fix ' + name;
    }

    if (type === 'docs') {
      return scope ? 'docs(' + scope + '): update ' + name : 'docs: update ' + name;
    }

    if (type === 'test') {
      if (file.status === 'added') {
        return scope ? 'test(' + scope + '): add tests for ' + (dir || name) : 'test: add tests for ' + (dir || name);
      }
      return scope ? 'test(' + scope + '): update tests' : 'test: update tests';
    }

    if (type === 'refactor') {
      if (symbols.length > 0) {
        const symbolNames = symbols.slice(0, 2).map((s) => s.name).join(' and ');
        return scope ? 'refactor(' + scope + '): refactor ' + symbolNames : 'refactor: refactor ' + symbolNames;
      }
      return scope ? 'refactor(' + scope + '): refactor ' + name : 'refactor: refactor ' + name;
    }

    if (type === 'style') {
      return scope ? 'style(' + scope + '): format code' : 'style: format code';
    }

    if (type === 'ci') {
      return scope ? 'ci(' + scope + '): update workflow' : 'ci: update workflow';
    }

    if (type === 'build') {
      return scope ? 'build(' + scope + '): update build config' : 'build: update build config';
    }

    return scope ? type + '(' + scope + '): update ' + name : type + ': update ' + name;
  }

  if (type === 'feat') {
    const newFiles = files.filter((f) => f.status === 'added').length;
    if (newFiles === files.length && files.length > 1) {
      return scope ? 'feat(' + scope + '): add ' + files.length + ' new files' : 'feat: add ' + files.length + ' new files';
    }
    return scope ? 'feat(' + scope + '): add features' : 'feat: add features';
  }

  if (type === 'fix') {
    return scope ? 'fix(' + scope + '): fix issues' : 'fix: fix issues';
  }

  if (type === 'docs') {
    return scope ? 'docs(' + scope + '): update documentation' : 'docs: update documentation';
  }

  if (type === 'test') {
    return scope ? 'test(' + scope + '): update tests' : 'test: update tests';
  }

  if (type === 'refactor') {
    return scope ? 'refactor(' + scope + '): refactor code' : 'refactor: refactor code';
  }

  return scope ? type + '(' + scope + '): update multiple files' : type + ': update multiple files';
}

function buildSubjectHinglish(type: CommitType, scope: string | undefined, files: FileChange[]): string {
  const mainFile = files[0];
  void mainFile;
  void files;
  if (files.length === 1) {
    const file = mainFile;
    const name = getBasename(file.path);
    const symbols = extractSymbols(file.path, [...file.addedLines, ...file.removedLines]);

    if (type === 'feat') {
      if (symbols.length > 0) {
        const symbolNames = symbols.slice(0, 2).map((s) => s.name).join(' and ');
        if (file.status === 'added') {
          return scope ? 'feat(' + scope + '): add ' + symbolNames : 'feat: add ' + symbolNames;
        }
        return scope ? 'feat(' + scope + '): update ' + symbolNames : 'feat: update ' + symbolNames;
      }
      if (file.status === 'added') {
        return scope ? 'feat(' + scope + '): add ' + name : 'feat: add ' + name;
      }
      return scope ? 'feat(' + scope + '): update ' + name : 'feat: update ' + name;
    }

    if (type === 'fix') {
      if (symbols.length > 0) {
        const symbolNames = symbols.slice(0, 2).map((s) => s.name).join(' and ');
        return scope ? 'fix(' + scope + '): fix ' + symbolNames : 'fix: fix ' + symbolNames;
      }
      return scope ? 'fix(' + scope + '): fix ' + name : 'fix: fix ' + name;
    }

    if (type === 'docs') {
      return scope ? 'docs(' + scope + '): update ' + name : 'docs: update ' + name;
    }

    if (type === 'test') {
      return scope ? 'test(' + scope + '): add tests' : 'test: add tests';
    }

    if (type === 'refactor') {
      return scope ? 'refactor(' + scope + '): refactor code' : 'refactor: refactor code';
    }

    return scope ? type + '(' + scope + '): update ' + name : type + ': update ' + name;
  }

  if (type === 'feat') {
    return scope ? 'feat(' + scope + '): add features' : 'feat: add features';
  }
  if (type === 'fix') {
    return scope ? 'fix(' + scope + '): fix issues' : 'fix: fix issues';
  }
  if (type === 'docs') {
    return scope ? 'docs(' + scope + '): update documentation' : 'docs: update documentation';
  }
  if (type === 'test') {
    return scope ? 'test(' + scope + '): update tests' : 'test: update tests';
  }

  return scope ? type + '(' + scope + '): update multiple files' : type + ': update multiple files';
}

function buildBody(files: FileChange[], why?: string, _language: OutputLanguage = 'english'): string {
  const lines: string[] = [];
  for (const file of files) {
    const name = getBasename(file.path);
    const dir = getDirname(file.path);
    const displayPath = dir ? dir + '/' + name : name;
    if (file.status === 'added') {
      lines.push('- add ' + displayPath);
    } else if (file.status === 'deleted') {
      lines.push('- remove ' + displayPath);
    } else if (file.status === 'renamed') {
      lines.push('- rename ' + displayPath);
    } else {
      lines.push('- update ' + displayPath);
    }
  }
  if (why && why.trim()) {
    lines.push('- Why: ' + why.trim());
  }
  return lines.join('\n');
}

export function buildMessage(input: RuleEngineInput, type: CommitType, scope: string | undefined): RuleEngineOutput {
  let subject: string;
  if (input.language === 'hinglish') {
    subject = buildSubjectHinglish(type, scope, input.files);
  } else {
    subject = buildSubjectEnglish(type, scope, input.files);
  }

  subject = applyCommitrc(subject, type, scope, input.commitrc);
  subject = subject.trim();
  if (subject.length > 72) {
    subject = truncateToLength(subject, 72);
  }

  const body = buildBody(input.files, input.why, input.language);
  const fullMessage = body ? subject + '\n\n' + body : subject;

  return {
    subject,
    body,
    fullMessage,
    type,
    scope,
    confidence: 0.85,
    engine: 'rulebased',
  };
}
