// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import type { SymbolInfo } from './types';

const FUNCTION_PATTERNS: Array<{ language: string; regex: RegExp; kind: SymbolInfo['kind'] }> = [
  {
    language: 'javascript',
    regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    kind: 'function',
  },
  {
    language: 'typescript',
    regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    kind: 'function',
  },
  {
    language: 'javascript',
    regex: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
    kind: 'function',
  },
  {
    language: 'typescript',
    regex: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
    kind: 'function',
  },
  {
    language: 'javascript',
    regex: /(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    kind: 'class',
  },
  {
    language: 'typescript',
    regex: /(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    kind: 'class',
  },
  {
    language: 'typescript',
    regex: /(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    kind: 'export',
  },
  {
    language: 'python',
    regex: /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    kind: 'function',
  },
  { language: 'python', regex: /^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm, kind: 'class' },
  {
    language: 'java',
    regex:
      /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[A-Za-z<>[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    kind: 'method',
  },
  {
    language: 'java',
    regex: /(?:public|private|protected)\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    kind: 'class',
  },
  {
    language: 'csharp',
    regex:
      /(?:public|private|protected|internal)\s+(?:static\s+)?[A-Za-z<>[\]\s,]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    kind: 'method',
  },
  {
    language: 'csharp',
    regex: /(?:public|private|protected|internal)\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    kind: 'class',
  },
  {
    language: 'go',
    regex: /^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    kind: 'function',
  },
  { language: 'go', regex: /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct/gm, kind: 'class' },
  { language: 'go', regex: /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+interface/gm, kind: 'export' },
  {
    language: 'php',
    regex:
      /(?:public|private|protected)?\s*(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    kind: 'function',
  },
  { language: 'php', regex: /class\s+([A-Za-z_][A-Za-z0-9_]*)/g, kind: 'class' },
];

const COMPONENT_PATTERNS = [
  /export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9]*)\s*\(/g,
  /export\s+(?:default\s+)?class\s+([A-Z][A-Za-z0-9]*)\s+extends/g,
  /const\s+([A-Z][A-Za-z0-9]*)\s*=\s*\([^)]*\)\s*=>/g,
];

function detectLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return 'typescript';
  }
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return 'javascript';
  }
  if (lower.endsWith('.py')) {
    return 'python';
  }
  if (lower.endsWith('.java')) {
    return 'java';
  }
  if (lower.endsWith('.cs')) {
    return 'csharp';
  }
  if (lower.endsWith('.go')) {
    return 'go';
  }
  if (lower.endsWith('.php')) {
    return 'php';
  }
  return 'unknown';
}

export function extractSymbols(path: string, lines: string[]): SymbolInfo[] {
  const language = detectLanguage(path);
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();
  const text = lines.join('\n');

  for (const pattern of FUNCTION_PATTERNS) {
    if (pattern.language !== language) {
      continue;
    }
    pattern.regex.lastIndex = 0;
    let match = pattern.regex.exec(text);
    while (match !== null) {
      const name = match[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        symbols.push({ name, kind: pattern.kind, language });
      }
      match = pattern.regex.exec(text);
    }
  }

  if (language === 'typescript' || language === 'javascript') {
    for (const pattern of COMPONENT_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      while (match !== null) {
        const name = match[1];
        if (name && !seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: 'component', language });
        }
        match = pattern.exec(text);
      }
    }
  }

  return symbols;
}
