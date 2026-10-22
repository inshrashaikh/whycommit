// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { truncate } from '../utils/json';

/**
 * Scans a diff for credentials before it is sent to a (possibly remote) model.
 *
 * The scanner is intentionally conservative and pattern based: it never tries
 * to guess entropy, so it produces the same result on every run and can be
 * unit tested deterministically.
 */

export type SecretSeverity = 'low' | 'medium' | 'high';

export type SecretKind =
  | 'private-key'
  | 'anthropic-api-key'
  | 'openai-api-key'
  | 'google-api-key'
  | 'aws-access-key'
  | 'github-token'
  | 'gitlab-token'
  | 'slack-token'
  | 'npm-token'
  | 'jwt'
  | 'connection-string'
  | 'generic-credential';

export interface SecretFinding {
  /** What kind of credential was detected. */
  kind: SecretKind;
  /** How serious the finding is. */
  severity: SecretSeverity;
  /** 1-based line number inside the scanned text. */
  line: number;
  /** Redacted preview of the offending line. */
  preview: string;
}

export interface SecretScanResult {
  /** All findings, ordered by line number. */
  findings: SecretFinding[];
  /** The highest severity that was found, or `none`. */
  severity: SecretSeverity | 'none';
  /** True when at least one finding has severity `high`. */
  containsHighSeverity: boolean;
  /** The scanned text with every detected credential masked. */
  redactedText: string;
}

interface SecretPattern {
  kind: SecretKind;
  severity: SecretSeverity;
  pattern: RegExp;
}

/**
 * Every pattern is anchored so that the match can be replaced with a mask of
 * the same length, which keeps the diff structure (and the line count)
 * intact for the model.
 */
const SECRET_PATTERNS: SecretPattern[] = [
  {
    kind: 'private-key',
    severity: 'high',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    kind: 'anthropic-api-key',
    severity: 'high',
    pattern: /sk-ant-[A-Za-z0-9_-]{16,}/g,
  },
  {
    kind: 'openai-api-key',
    severity: 'high',
    pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}/g,
  },
  {
    kind: 'google-api-key',
    severity: 'high',
    pattern: /\bAIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    kind: 'aws-access-key',
    severity: 'high',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    kind: 'github-token',
    severity: 'high',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  },
  {
    kind: 'gitlab-token',
    severity: 'high',
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g,
  },
  {
    kind: 'slack-token',
    severity: 'high',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    kind: 'npm-token',
    severity: 'high',
    pattern: /\bnpm_[A-Za-z0-9]{30,}/g,
  },
  {
    kind: 'jwt',
    severity: 'medium',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    kind: 'connection-string',
    severity: 'medium',
    pattern:
      /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@]+:[^\s:/@]+@/g,
  },
  {
    kind: 'generic-credential',
    severity: 'medium',
    pattern:
      /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s]{6,}["']/gi,
  },
];

const SEVERITY_ORDER: Record<SecretSeverity, number> = { low: 1, medium: 2, high: 3 };

/**
 * Scans the given text for credentials.
 *
 * @param text  The text to scan, typically a unified diff.
 */
export function scanSecrets(text: string): SecretScanResult {
  if (!text) {
    return {
      findings: [],
      severity: 'none',
      containsHighSeverity: false,
      redactedText: text ?? '',
    };
  }

  const findings: SecretFinding[] = [];
  let redactedText = text;

  for (const { kind, severity, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(redactedText);
    while (match !== null) {
      const matched = match[0];
      const line = countLines(redactedText, match.index);
      const masked = maskFor(matched);
      findings.push({
        kind,
        severity,
        line,
        preview: buildPreview(redactedText, match.index, matched.length, masked),
      });
      redactedText = redactedText.replace(matched, masked);
      pattern.lastIndex = 0;
      match = pattern.exec(redactedText);
    }
  }

  findings.sort((a, b) => a.line - b.line);

  let severity: SecretSeverity | 'none' = 'none';
  for (const finding of findings) {
    if (severity === 'none' || SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[severity]) {
      severity = finding.severity;
    }
  }

  return {
    findings,
    severity,
    containsHighSeverity: severity === 'high',
    redactedText,
  };
}

/** Replaces every detected credential in the text with a mask. */
export function redactSecrets(text: string): string {
  return scanSecrets(text).redactedText;
}

/** True when the text contains at least one credential of `medium` or `high` severity. */
export function containsSensitiveData(text: string): boolean {
  const result = scanSecrets(text);
  return result.severity === 'medium' || result.severity === 'high';
}

/**
 * Replaces a matched credential with a mask of the same length so the diff
 * keeps its shape.
 */
function maskFor(matched: string): string {
  const visible = matched.length <= 8 ? 0 : 4;
  if (visible === 0) {
    return '[redacted]';
  }
  return `${matched.slice(0, visible)}${'*'.repeat(Math.max(4, matched.length - visible))}`;
}

function countLines(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

/**
 * Builds the preview of the offending line.
 *
 * The credential itself is replaced by its mask, so a finding can never leak
 * the secret it reports.
 */
function buildPreview(text: string, index: number, length: number, masked: string): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineEnd = text.indexOf('\n', index + length);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const relativeStart = index - lineStart;
  const safe =
    relativeStart >= 0 && relativeStart + length <= line.length
      ? line.slice(0, relativeStart) + masked + line.slice(relativeStart + length)
      : line.replace(masked, masked);
  return truncate(safe.trim(), 120);
}
