// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { isPlainObject, safeJsonParse } from '../utils/json';

/**
 * Support for a per-repository `.commitrc` file.
 *
 * The file lets a repository pin down the conventions Whycommit should follow:
 * the allowed types and scopes, the language, the maximum subject length and
 * whether a sign-off line is required.
 *
 * ```json
 * {
 *   "types": ["feat", "fix", "chore"],
 *   "scopes": ["api", "ui"],
 *   "language": "english",
 *   "maxSubjectLength": 72,
 *   "signOff": true
 * }
 * ```
 */

export const COMMITRC_FILENAMES = ['.commitrc', '.commitrc.json'] as const;

export interface CommitrcConfig {
  /** Allowed Conventional Commits types. */
  types?: string[];
  /** Allowed scopes. */
  scopes?: string[];
  /** Language of the generated message. */
  language?: 'english' | 'hinglish';
  /** Maximum length of the subject line. */
  maxSubjectLength?: number;
  /** Whether a `Signed-off-by:` trailer should be requested. */
  signOff?: boolean;
}

export interface CommitrcValidation {
  /** True when the file could be parsed and every value is valid. */
  valid: boolean;
  /** The parsed configuration, or `null` when the file is unusable. */
  config: CommitrcConfig | null;
  /** Hard errors that make the file unusable. */
  errors: string[];
  /** Non fatal remarks, for example unknown keys. */
  warnings: string[];
}

const KNOWN_KEYS = new Set(['types', 'scopes', 'language', 'maxSubjectLength', 'signOff']);

/**
 * Parses and validates the contents of a `.commitrc` file.
 *
 * @param content  The raw file contents.
 */
export function parseCommitrc(content: string): CommitrcValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, config: null, errors: ['The .commitrc file is empty.'], warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      config: null,
      errors: [`The .commitrc file is not valid JSON: ${message}`],
      warnings,
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      config: null,
      errors: ['The .commitrc file must contain a JSON object.'],
      warnings,
    };
  }

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown key "${key}" in the .commitrc file is ignored.`);
    }
  }

  const config: CommitrcConfig = {};

  const types = parsed.types;
  if (types !== undefined) {
    if (!Array.isArray(types)) {
      errors.push('"types" must be an array of strings.');
    } else {
      const invalid = types.filter(
        (value) => typeof value !== 'string' || value.trim().length === 0,
      );
      if (invalid.length > 0) {
        errors.push('"types" must only contain non-empty strings.');
      } else {
        config.types = (types as string[]).map((value) => value.trim().toLowerCase());
      }
    }
  }

  const scopes = parsed.scopes;
  if (scopes !== undefined) {
    if (!Array.isArray(scopes)) {
      errors.push('"scopes" must be an array of strings.');
    } else {
      const invalid = scopes.filter(
        (value) => typeof value !== 'string' || value.trim().length === 0,
      );
      if (invalid.length > 0) {
        errors.push('"scopes" must only contain non-empty strings.');
      } else {
        config.scopes = (scopes as string[]).map((value) => value.trim());
      }
    }
  }

  const language = parsed.language;
  if (language !== undefined) {
    if (language !== 'english' && language !== 'hinglish') {
      errors.push('"language" must be either "english" or "hinglish".');
    } else {
      config.language = language;
    }
  }

  const maxSubjectLength = parsed.maxSubjectLength;
  if (maxSubjectLength !== undefined) {
    if (
      typeof maxSubjectLength !== 'number' ||
      !Number.isInteger(maxSubjectLength) ||
      maxSubjectLength < 10 ||
      maxSubjectLength > 200
    ) {
      errors.push('"maxSubjectLength" must be an integer between 10 and 200.');
    } else {
      config.maxSubjectLength = maxSubjectLength;
    }
  }

  const signOff = parsed.signOff;
  if (signOff !== undefined) {
    if (typeof signOff !== 'boolean') {
      errors.push('"signOff" must be a boolean.');
    } else {
      config.signOff = signOff;
    }
  }

  return {
    valid: errors.length === 0,
    config: errors.length === 0 ? config : null,
    errors,
    warnings,
  };
}

/**
 * Parses a `.commitrc` file that is known to be valid JSON but might contain
 * unexpected shapes. Used when the file is read from disk.
 */
export function parseCommitrcSafe(content: string): CommitrcValidation {
  const parsed = safeJsonParse<unknown>(content, null);
  if (parsed === null) {
    return {
      valid: false,
      config: null,
      errors: ['The .commitrc file is not valid JSON.'],
      warnings: [],
    };
  }
  return parseCommitrc(JSON.stringify(parsed));
}

/**
 * Checks a generated subject line against the repository configuration.
 *
 * @returns A list of human readable problems. Empty when the subject is fine.
 */
export function validateSubject(
  subject: string,
  config: CommitrcConfig | null,
  options: { detectedTypes?: string[]; detectedScopes?: string[] } = {},
): string[] {
  const problems: string[] = [];

  if (!subject || subject.trim().length === 0) {
    problems.push('The subject line is empty.');
    return problems;
  }

  const trimmed = subject.trim();

  const maxLength = config?.maxSubjectLength ?? 72;
  if (trimmed.length > maxLength) {
    problems.push(
      `The subject line is ${trimmed.length} characters long, the maximum is ${maxLength}.`,
    );
  }

  const match = trimmed.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/);
  if (!match) {
    return problems;
  }

  const type = match[1];
  const scope = match[2];

  if (config?.types && config.types.length > 0 && !config.types.includes(type)) {
    problems.push(`The type "${type}" is not allowed by the .commitrc file.`);
  }

  if (config?.scopes && config.scopes.length > 0 && scope) {
    if (!config.scopes.includes(scope)) {
      problems.push(`The scope "${scope}" is not allowed by the .commitrc file.`);
    }
  }

  if (config?.scopes && config.scopes.length > 0 && !scope) {
    const knownScopes = options.detectedScopes ?? [];
    const suggestion = knownScopes[0];
    problems.push(
      suggestion
        ? `The .commitrc file defines scopes but the subject has none. Consider "${suggestion}".`
        : 'The .commitrc file defines scopes but the subject has none.',
    );
  }

  if (config?.types && config.types.length > 0 && !options.detectedTypes?.includes(type)) {
    // Not an error, just a hint that the type is new for this repository.
    problems.push(`The type "${type}" has not been used in this repository before.`);
  }

  return problems;
}

/** Renders the configuration as prompt instructions. */
export function describeCommitrc(config: CommitrcConfig | null): string[] {
  if (!config) {
    return [];
  }

  const instructions: string[] = [];

  if (config.types && config.types.length > 0) {
    instructions.push(`Only use these commit types: ${config.types.join(', ')}.`);
  }
  if (config.scopes && config.scopes.length > 0) {
    instructions.push(`Only use these scopes: ${config.scopes.join(', ')}.`);
  }
  if (config.maxSubjectLength !== undefined) {
    instructions.push(`The subject line must not exceed ${config.maxSubjectLength} characters.`);
  }
  if (config.signOff) {
    instructions.push('End the commit message with a "Signed-off-by:" trailer.');
  }

  return instructions;
}
