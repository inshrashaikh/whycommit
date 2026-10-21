// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';

const SECRET_PATTERNS: RegExp[] = [
  // Anthropic keys: sk-ant-...
  /sk-ant-[A-Za-z0-9_-]{6,}/g,
  // OpenAI / general provider keys: sk-...
  /sk-[A-Za-z0-9_-]{10,}/g,
  // Google style keys: AIza...
  /AIza[0-9A-Za-z_-]{20,}/g,
  // Bearer / authorization headers
  /\b(authorization|api[_-]?key|x-api-key|bearer)\b\s*[:=]\s*("?)[^\s",}]+\2/gi,
  // JSON style payloads
  /("(?:api[_-]?key|token|secret|password)"\s*:\s*)"[^"]*"/gi,
];

/**
 * Removes anything that looks like a credential from a string before it is written
 * to the output channel. This is a defence in depth measure: secrets are never
 * intentionally logged in the first place.
 */
export function redact(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (_match, prefix?: string) => {
      if (prefix && /("|")$/.test(prefix)) {
        return `${prefix}"[redacted]"`;
      }
      if (prefix) {
        return `${prefix}[redacted]`;
      }
      return '[redacted]';
    });
  }
  return output;
}

function formatArgs(message: string, args: unknown[]): string {
  if (args.length === 0) {
    return message;
  }
  const rendered = args.map((arg) => {
    if (arg instanceof Error) {
      return arg.message;
    }
    try {
      return typeof arg === 'string' ? arg : JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });
  return `${message} ${rendered.join(' ')}`;
}

/**
 * Thin wrapper around a VS Code log output channel. Every message is redacted
 * before it leaves the extension.
 */
export class Logger implements vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;

  constructor(name = 'Whycommit') {
    this.channel = vscode.window.createOutputChannel(name, { log: true });
  }

  trace(message: string, ...args: unknown[]): void {
    this.channel.trace(redact(formatArgs(message, args)));
  }

  debug(message: string, ...args: unknown[]): void {
    this.channel.debug(redact(formatArgs(message, args)));
  }

  info(message: string, ...args: unknown[]): void {
    this.channel.info(redact(formatArgs(message, args)));
  }

  warn(message: string, ...args: unknown[]): void {
    this.channel.warn(redact(formatArgs(message, args)));
  }

  error(message: string, error?: unknown): void {
    const detail =
      error instanceof Error ? ` - ${error.message}` : error ? ` - ${String(error)}` : '';
    this.channel.error(redact(`${message}${detail}`));
    if (error instanceof Error && error.stack) {
      this.channel.debug(redact(error.stack));
    }
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
