// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { extractPath, isBinarySection, splitDiffSections } from '../diffProcessor';
import type { FileChange } from './types';

function classifyStatus(section: string): FileChange['status'] {
  if (/^new file mode/m.test(section)) {
    return 'added';
  }
  if (/^deleted file mode/m.test(section)) {
    return 'deleted';
  }
  if (/^rename from/m.test(section)) {
    return 'renamed';
  }
  return 'modified';
}

function collectOldPath(section: string): string | undefined {
  const match = section.match(/^rename from (.+)$/m);
  if (!match) {
    return undefined;
  }
  let path = match[1].trim();
  if (path.length > 1 && path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
  }
  if (path.startsWith('a/')) {
    path = path.slice(2);
  }
  return path;
}

function splitLines(content: string): string[] {
  return content.split('\n');
}

export function parseStagedDiff(rawDiff: string): FileChange[] {
  if (!rawDiff.trim()) {
    return [];
  }

  const sections = splitDiffSections(rawDiff);
  const files: FileChange[] = [];

  for (const section of sections) {
    const path = extractPath(section);
    const status = classifyStatus(section);
    const isBinary = isBinarySection(section);
    const addedLines: string[] = [];
    const removedLines: string[] = [];
    const hunks: string[] = [];

    if (isBinary) {
      files.push({
        path,
        status,
        oldPath: collectOldPath(section),
        addedLines: [],
        removedLines: [],
        hunks: [],
        isBinary: true,
      });
      continue;
    }

    const lines = splitLines(section);
    for (const line of lines) {
      if (line.startsWith('@@')) {
        hunks.push(line);
        continue;
      }
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push(line.slice(1));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removedLines.push(line.slice(1));
      }
    }

    files.push({
      path,
      status,
      oldPath: collectOldPath(section),
      addedLines,
      removedLines,
      hunks,
      isBinary: false,
    });
  }

  return files;
}
