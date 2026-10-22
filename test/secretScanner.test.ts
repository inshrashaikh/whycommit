// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { describe, expect, it } from 'vitest';
import { containsSensitiveData, redactSecrets, scanSecrets } from '../src/core/secretScanner';

describe('scanSecrets', () => {
  it('finds nothing in clean text', () => {
    const result = scanSecrets('const app = express();\napp.listen(3000);');
    expect(result.findings).toEqual([]);
    expect(result.severity).toBe('none');
    expect(result.containsHighSeverity).toBe(false);
    expect(result.redactedText).toBe('const app = express();\napp.listen(3000);');
  });

  it('handles an empty input', () => {
    const result = scanSecrets('');
    expect(result.findings).toEqual([]);
    expect(result.severity).toBe('none');
  });

  it('detects an Anthropic API key', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    const result = scanSecrets(`const key = "${key}";`);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].kind).toBe('anthropic-api-key');
    expect(result.findings[0].severity).toBe('high');
    expect(result.containsHighSeverity).toBe(true);
  });

  it('detects an OpenAI API key', () => {
    const result = scanSecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345');
    expect(result.findings[0].kind).toBe('openai-api-key');
  });

  it('detects a private key block', () => {
    const result = scanSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n');
    expect(result.findings[0].kind).toBe('private-key');
    expect(result.findings[0].severity).toBe('high');
  });

  it('detects a generic password assignment', () => {
    const result = scanSecrets('password = "hunter2000"');
    expect(result.findings[0].kind).toBe('generic-credential');
    expect(result.findings[0].severity).toBe('medium');
  });

  it('detects a connection string with a password', () => {
    const result = scanSecrets('DATABASE_URL=postgres://user:s3cret@db.example.com/app');
    expect(result.findings[0].kind).toBe('connection-string');
  });

  it('detects a GitHub token', () => {
    const result = scanSecrets(`token: ghp_${'a'.repeat(36)}`);
    expect(result.findings[0].kind).toBe('github-token');
  });

  it('reports the line number of the finding', () => {
    const text = 'line one\nline two\npassword = "hunter2000"\nline four';
    const result = scanSecrets(text);
    expect(result.findings[0].line).toBe(3);
  });

  it('masks the credential while keeping the line structure', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    const text = `a\nconst key = "${key}";\nb`;
    const result = scanSecrets(text);
    expect(result.redactedText).not.toContain(key);
    expect(result.redactedText.split('\n')).toHaveLength(3);
  });

  it('never leaks the raw secret into the preview', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    const result = scanSecrets(`const key = "${key}";`);
    expect(result.findings[0].preview).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
});

describe('redactSecrets', () => {
  it('replaces every credential', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    const redacted = redactSecrets(`key=${key}`);
    expect(redacted).not.toContain(key);
    expect(redacted).toContain('sk-a');
  });
});

describe('containsSensitiveData', () => {
  it('is false for clean text', () => {
    expect(containsSensitiveData('nothing to see here')).toBe(false);
  });

  it('is true when a credential is present', () => {
    expect(containsSensitiveData('password = "hunter2000"')).toBe(true);
  });
});
