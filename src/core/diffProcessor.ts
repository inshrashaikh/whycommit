// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Prepares a raw unified diff for an LLM:
 *
 *  - splits the diff into per-file sections,
 *  - drops binary files and dependency lockfiles,
 *  - truncates oversized sections to a token budget,
 *  - and keeps a short statistics header so the model still knows the shape of
 *    the change even when parts of the diff had to be cut.
 */

/** Approximate number of characters per token. */
const CHARS_PER_TOKEN = 4;

/** Minimum number of characters kept for a single file section. */
const MIN_FILE_CHARS = 800;

/** Characters reserved for the `--- FILE: <path> ---` block header. */
const FILE_BLOCK_OVERHEAD = 16;

/** Characters reserved for the "... [truncated ...] ..." marker. */
const TRUNCATION_MARKER_RESERVE = 64;

/** Characters reserved for the note about the files that did not fit at all. */
const OMISSION_NOTE_RESERVE = 80;

/** Files that only contain generated dependency metadata and never help a commit message. */
const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'cargo.toml.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
  'poetry.lock',
  'pipfile.lock',
  'uv.lock',
  'mix.lock',
  'pubspec.lock',
  'packages.lock.json',
  'flake.lock',
  'gradle.lockfile',
  'paket.lock',
  'cabal.project.freeze',
  'podfile.lock',
  'ocaml.lock',
]);

export type SkipReason = 'binary' | 'lockfile';

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  binaryFiles: number;
  lockfilesSkipped: number;
}

export interface ProcessedDiff {
  /** The final text that is sent to the model. */
  text: string;
  /** Statistics about the staged change. */
  stats: DiffStats;
  /** Paths of the files that were included. */
  includedFiles: string[];
  /** Files that were dropped and why. */
  skippedFiles: SkippedFile[];
  /** Paths of the files whose diff had to be truncated. */
  truncatedFiles: string[];
  /** Rough token estimate of {@link text}. */
  estimatedTokens: number;
  /** True when at least one file had to be truncated. */
  truncated: boolean;
}

/** Splits a unified diff into one section per file. */
export function splitDiffSections(diff: string): string[] {
  return diff
    .split(/^(?=diff --git )/m)
    .map((section) => section.replace(/\s+$/, ''))
    .filter((section) => section.trim().length > 0);
}

/** Extracts the repository relative path of a diff section. */
export function extractPath(section: string): string {
  const plus = section.match(/^\+\+\+ (.+)$/m);
  const minus = section.match(/^--- (.+)$/m);

  const candidates = [plus?.[1], minus?.[1]].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    if (normalized && normalized !== '/dev/null') {
      return normalized;
    }
  }

  const header = section.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (header) {
    return normalizePath(header[2] ?? header[1]);
  }

  return 'unknown';
}

function normalizePath(raw: string): string {
  let value = raw.trim();
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('a/') || value.startsWith('b/')) {
    value = value.slice(2);
  }
  return value;
}

/** True when the section describes a binary file. */
export function isBinarySection(section: string): boolean {
  return /^(?:Binary files .* differ|GIT binary patch)$/m.test(section);
}

/** True when the file is a dependency lockfile that should never reach the model. */
export function isLockfile(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? path;
  return LOCKFILE_NAMES.has(name.toLowerCase());
}

/** Counts added and removed lines in a diff section. */
export function countChanges(section: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;

  for (const line of section.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('+')) {
      insertions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }

  return { insertions, deletions };
}

function truncateSection(body: string, maxChars: number): { text: string; truncated: boolean } {
  if (body.length <= maxChars) {
    return { text: body, truncated: false };
  }

  // The file did not get any budget at all, so only the file name is listed.
  if (maxChars <= 0) {
    return { text: '[diff omitted]', truncated: true };
  }

  const slice = body.slice(0, maxChars);
  const lastNewline = slice.lastIndexOf('\n');
  const kept = lastNewline > 0 ? slice.slice(0, lastNewline) : slice;
  const dropped = body.slice(kept.length);
  const droppedLines = dropped.split('\n').filter((line) => line.length > 0).length;

  return {
    text: `${kept}\n... [truncated, ${droppedLines} more diff lines omitted] ...`,
    truncated: true,
  };
}

/**
 * Processes a raw staged diff and returns the text that should be sent to the model.
 *
 * @param rawDiff    The unified diff of the staged changes.
 * @param maxTokens  Approximate token budget for the resulting text.
 */
export function processDiff(rawDiff: string, maxTokens: number): ProcessedDiff {
  const emptyResult: ProcessedDiff = {
    text: '',
    stats: { filesChanged: 0, insertions: 0, deletions: 0, binaryFiles: 0, lockfilesSkipped: 0 },
    includedFiles: [],
    skippedFiles: [],
    truncatedFiles: [],
    estimatedTokens: 0,
    truncated: false,
  };

  if (!rawDiff.trim()) {
    return emptyResult;
  }

  const sections = splitDiffSections(rawDiff);
  const kept: Array<{ path: string; body: string }> = [];
  const skippedFiles: SkippedFile[] = [];

  let insertions = 0;
  let deletions = 0;
  let binaryFiles = 0;
  let lockfilesSkipped = 0;

  for (const section of sections) {
    const path = extractPath(section);

    if (isBinarySection(section)) {
      binaryFiles += 1;
      skippedFiles.push({ path, reason: 'binary' });
      continue;
    }

    if (isLockfile(path)) {
      lockfilesSkipped += 1;
      skippedFiles.push({ path, reason: 'lockfile' });
      continue;
    }

    const changes = countChanges(section);
    insertions += changes.insertions;
    deletions += changes.deletions;
    kept.push({ path, body: section });
  }

  const stats: DiffStats = {
    filesChanged: sections.length,
    insertions,
    deletions,
    binaryFiles,
    lockfilesSkipped,
  };

  const header = buildHeader(stats, skippedFiles);
  const charBudget = Math.max(1000, Math.floor(maxTokens * CHARS_PER_TOKEN));

  const totalBodyChars = kept.reduce((sum, item) => sum + item.body.length, 0);

  // The overhead of one file block: the separator line plus the name of the
  // file. `TRUNCATION_MARKER_RESERVE` is added on top of it for every file
  // that has to be truncated.
  const plainOverhead = kept.map((item) => FILE_BLOCK_OVERHEAD + item.path.length);
  const totalPlainOverhead = plainOverhead.reduce((sum, value) => sum + value, 0);

  // How many files can be listed at all? When a diff touches hundreds of
  // files, even the file headers do not fit into the budget, so the surplus
  // files are dropped and reported in the header.
  const listingBudget = charBudget - header.length - OMISSION_NOTE_RESERVE;
  let affordable = 0;
  let listingOverhead = 0;

  for (let index = 0; index < kept.length; index += 1) {
    const cost = plainOverhead[index] + TRUNCATION_MARKER_RESERVE;
    if (listingOverhead + cost > listingBudget && affordable > 0) {
      break;
    }
    listingOverhead += cost;
    affordable += 1;
  }

  const selected = kept.slice(0, affordable);
  const omittedFiles = kept.slice(affordable);
  const finalHeader =
    omittedFiles.length > 0
      ? `${header}\n# ${omittedFiles.length} more file(s) omitted, the diff is too large for the token budget`
      : header;

  const selectedBodyChars = selected.reduce((sum, item) => sum + item.body.length, 0);
  const selectedPlainOverhead = selected.reduce(
    (sum, _item, index) => sum + plainOverhead[index],
    0,
  );
  const selectedMarkerReserve = selected.length * TRUNCATION_MARKER_RESERVE;

  const fitsIntoBudget =
    omittedFiles.length === 0 &&
    finalHeader.length + totalPlainOverhead + totalBodyChars <= charBudget;

  // Every file gets a share of the budget proportional to its size, with a
  // floor so that small files are never reduced to nothing. When the floor
  // pushes the total over the budget, all shares are scaled down again.
  let allowances: number[];

  if (fitsIntoBudget) {
    allowances = selected.map((item) => item.body.length);
  } else {
    const contentBudget = Math.max(
      0,
      charBudget - finalHeader.length - selectedPlainOverhead - selectedMarkerReserve,
    );

    allowances = selected.map((item) => {
      const proportional =
        selectedBodyChars > 0
          ? Math.floor((contentBudget * item.body.length) / selectedBodyChars)
          : 0;
      return Math.min(item.body.length, Math.max(MIN_FILE_CHARS, proportional));
    });

    const allowanceSum = allowances.reduce((sum, value) => sum + value, 0);
    if (allowanceSum > contentBudget && allowanceSum > 0) {
      const factor = contentBudget / allowanceSum;
      allowances = allowances.map((value) => Math.floor(value * factor));
    }
  }

  const parts: string[] = [];
  const truncatedFiles: string[] = [];
  let truncated = false;

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const result = truncateSection(item.body, allowances[index]);
    if (result.truncated) {
      truncated = true;
      truncatedFiles.push(item.path);
    }

    parts.push(`--- FILE: ${item.path} ---\n${result.text}`);
  }

  const text = `${finalHeader}\n${parts.join('\n\n')}`.trim();

  return {
    text,
    stats,
    includedFiles: selected.map((item) => item.path),
    skippedFiles,
    truncatedFiles,
    estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN),
    truncated: truncated || omittedFiles.length > 0,
  };
}

function buildHeader(stats: DiffStats, skippedFiles: SkippedFile[]): string {
  const lines: string[] = [];
  lines.push('# Staged changes (index vs HEAD)');
  lines.push(
    `# files changed: ${stats.filesChanged} | insertions: +${stats.insertions} | deletions: -${stats.deletions}`,
  );

  if (skippedFiles.length > 0) {
    const skipped = skippedFiles.map((file) => `${file.path} (${file.reason})`).join(', ');
    lines.push(`# skipped files: ${skipped}`);
  }

  return lines.join('\n');
}
