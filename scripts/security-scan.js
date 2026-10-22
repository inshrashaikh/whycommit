// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Scans the working tree and the whole git history for credentials, `.env`
 * files and personal data.
 *
 * Usage:
 *   node scripts/security-scan.js            # human readable report
 *   node scripts/security-scan.js --json     # machine readable report
 *
 * The exit code is 1 when a credential was found, otherwise 0.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'out',
  'dist',
  'coverage',
  '.vscode-test',
]);

const IGNORED_FILES = new Set(['package-lock.json']);

const MAX_FILE_SIZE = 4 * 1024 * 1024;

/**
 * Reads the allow-list from `.securityscanignore`.
 *
 * @returns {{patterns: string[], reasons: string[]}}
 */
function readAllowList() {
  const file = path.join(ROOT, '.securityscanignore');
  if (!fs.existsSync(file)) {
    return { patterns: [], reasons: [] };
  }

  const patterns = [];
  const reasons = [];

  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('#')) {
      reasons.push(line);
      continue;
    }
    patterns.push(line.replace(/^\/+/, '').replace(/\/+$/, ''));
  }

  return { patterns, reasons };
}

/**
 * Checks whether a relative path is covered by the allow-list.
 *
 * @param {string} relativePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
function isAllowed(relativePath, patterns) {
  const normalized = relativePath.replace(/\\/g, '/');
  return patterns.some((pattern) => {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      return regex.test(normalized);
    }
    return normalized === pattern;
  });
}

/** Patterns that indicate a credential. */
const SECRET_PATTERNS = [
  { name: 'Anthropic API key', regex: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'OpenAI API key', regex: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'AWS access key id', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'GitHub fine grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{50,}/ },
  { name: 'GitLab token', regex: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'npm token', regex: /\bnpm_[A-Za-z0-9]{30,}/ },
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'JSON web token', regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  {
    name: 'Credential in an assignment',
    regex: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s]{6,}["']/i,
  },
  {
    name: 'Connection string with a password',
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@]+:[^\s:/@]+@/,
  },
];

/** Patterns that indicate personal data. */
const PERSONAL_PATTERNS = [
  { name: 'E-mail address', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'International phone number', regex: /\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/ },
];

/** File names that usually hold secrets. */
const SENSITIVE_FILE_NAMES = [
  /^\.env(\..+)?$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^\.htpasswd$/i,
  /^secrets?\.(ya?ml|json|toml)$/i,
  /^\.aws\/credentials$/i,
];

/**
 * Runs a git command and returns its stdout.
 *
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

/**
 * Scans a text for every pattern.
 *
 * @param {string} text
 * @param {{name: string, regex: RegExp}[]} patterns
 * @returns {{name: string, match: string, line: number}[]}
 */
function scanText(text, patterns) {
  const findings = [];
  if (!text) {
    return findings;
  }

  const lines = text.split('\n');

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`);
    let match = regex.exec(text);
    while (match !== null) {
      const index = match.index;
      let line = 1;
      for (let i = 0; i < index && i < text.length; i += 1) {
        if (text.charCodeAt(i) === 10) {
          line += 1;
        }
      }
      findings.push({ name: pattern.name, match: match[0], line });
      regex.lastIndex = index + match[0].length;
      match = regex.exec(text);
    }
  }

  void lines;
  return findings;
}

/**
 * Collects every file of the working tree.
 *
 * @returns {string[]} absolute paths
 */
function collectWorkingTree() {
  const files = [];

  const walk = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        walk(full);
      } else if (entry.isFile()) {
        if (IGNORED_FILES.has(entry.name) || entry.name.endsWith('.vsix')) {
          continue;
        }
        files.push(full);
      }
    }
  };

  walk(ROOT);
  return files;
}

/**
 * Collects every blob of the git history.
 *
 * @returns {{sha: string, path: string}[]}
 */
function collectHistoryBlobs() {
  const output = git(['rev-list', '--objects', '--all']);
  const blobs = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const separator = line.indexOf(' ');
    if (separator === -1) {
      continue;
    }
    const sha = line.slice(0, separator);
    const filePath = line.slice(separator + 1);
    blobs.push({ sha, path: filePath });
  }

  return blobs;
}

/**
 * Checks whether a path looks like a sensitive file name.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
function isSensitiveFileName(relativePath) {
  const name = path.basename(relativePath).replace(/\\/g, '/');
  return SENSITIVE_FILE_NAMES.some((pattern) => pattern.test(name));
}

function main() {
  const asJson = process.argv.includes('--json');
  const allowList = readAllowList();
  const report = {
    workingTree: { secrets: [], personal: [], sensitiveFiles: [], scanned: 0 },
    history: { secrets: [], personal: [], sensitiveFiles: [], scanned: 0 },
    allowListed: [],
    notes: [],
  };

  // The owner of the repository. Their e-mail is part of the git metadata and
  // cannot be removed without rewriting the history.
  let ownerEmail = '';
  try {
    ownerEmail = git(['config', 'user.email']).trim();
  } catch {
    ownerEmail = '';
  }

  // 1. The working tree.
  for (const file of collectWorkingTree()) {
    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    report.workingTree.scanned += 1;

    if (isSensitiveFileName(relative)) {
      report.workingTree.sensitiveFiles.push(relative);
    }

    if (isAllowed(relative, allowList.patterns)) {
      report.allowListed.push(relative);
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_SIZE) {
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (content.includes('\u0000')) {
      continue; // binary
    }

    for (const finding of scanText(content, SECRET_PATTERNS)) {
      report.workingTree.secrets.push({ file: relative, ...finding });
    }
    for (const finding of scanText(content, PERSONAL_PATTERNS)) {
      if (finding.name === 'E-mail address' && ownerEmail && finding.match === ownerEmail) {
        continue;
      }
      report.workingTree.personal.push({ file: relative, ...finding });
    }
  }

  // 2. The git history.
  let blobs = [];
  try {
    blobs = collectHistoryBlobs();
  } catch (error) {
    report.notes.push(`The git history could not be read: ${error.message}`);
  }

  for (const blob of blobs) {
    let content;
    try {
      const type = git(['cat-file', '-t', blob.sha]).trim();
      if (type !== 'blob') {
        continue;
      }
      content = git(['cat-file', 'blob', blob.sha]);
    } catch {
      continue;
    }

    report.history.scanned += 1;

    if (isSensitiveFileName(blob.path)) {
      report.history.sensitiveFiles.push(blob.path);
    }
    if (IGNORED_FILES.has(path.basename(blob.path))) {
      continue;
    }
    if (isAllowed(blob.path, allowList.patterns)) {
      if (!report.allowListed.includes(blob.path)) {
        report.allowListed.push(blob.path);
      }
      continue;
    }
    if (!content || content.includes('\u0000')) {
      continue;
    }

    for (const finding of scanText(content, SECRET_PATTERNS)) {
      report.history.secrets.push({ file: blob.path, sha: blob.sha.slice(0, 8), ...finding });
    }
    for (const finding of scanText(content, PERSONAL_PATTERNS)) {
      if (finding.name === 'E-mail address' && ownerEmail && finding.match === ownerEmail) {
        continue;
      }
      report.history.personal.push({ file: blob.path, sha: blob.sha.slice(0, 8), ...finding });
    }
  }

  // 3. The commit metadata itself.
  const commitEmails = new Set();
  try {
    const log = git(['log', '--all', '--format=%ae']);
    for (const mail of log.split('\n')) {
      const trimmed = mail.trim();
      if (trimmed && trimmed !== ownerEmail) {
        commitEmails.add(trimmed);
      }
    }
  } catch {
    /* no commits yet */
  }
  if (commitEmails.size > 0) {
    report.notes.push(
      `The commit metadata contains ${commitEmails.size} other e-mail address(es): ${[...commitEmails].join(', ')}`,
    );
  }

  const failed =
    report.workingTree.secrets.length > 0 ||
    report.history.secrets.length > 0 ||
    report.workingTree.sensitiveFiles.length > 0 ||
    report.history.sensitiveFiles.length > 0;

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ...report, failed }, null, 2)}\n`);
  } else {
    printReport(report, failed, ownerEmail);
  }

  process.exit(failed ? 1 : 0);
}

function printReport(report, failed, ownerEmail) {
  const line = '-'.repeat(72);

  console.log(line);
  console.log('Whycommit security scan');
  console.log(line);
  console.log(`Repository: ${ROOT}`);
  console.log(`Platform:   ${os.platform()} ${os.release()}`);
  console.log('');

  console.log(`Working tree: ${report.workingTree.scanned} file(s) inspected`);
  console.log(`Git history:  ${report.history.scanned} blob(s) inspected`);
  console.log('');

  const sections = [
    ['Credentials in the working tree', report.workingTree.secrets],
    ['Credentials in the git history', report.history.secrets],
    ['Sensitive file names in the working tree', report.workingTree.sensitiveFiles],
    ['Sensitive file names in the git history', report.history.sensitiveFiles],
  ];

  let clean = true;

  for (const [title, entries] of sections) {
    if (entries.length === 0) {
      console.log(`[ OK ] ${title}: none`);
      continue;
    }
    clean = false;
    console.log(`[!!] ${title}: ${entries.length}`);
    for (const entry of entries) {
      if (typeof entry === 'string') {
        console.log(`       ${entry}`);
      } else {
        console.log(`       ${entry.file}:${entry.line}  ${entry.name}  (${entry.match.slice(0, 24)})`);
      }
    }
  }

  console.log('');
  console.log('Personal data');
  const personal = [...report.workingTree.personal, ...report.history.personal];
  if (personal.length === 0) {
    console.log('[ OK ] no personal data found');
  } else {
    for (const entry of personal) {
      console.log(`[!!] ${entry.file}:${entry.line}  ${entry.name}  (${entry.match})`);
    }
  }

  console.log('');
  console.log('Notes');
  if (report.notes.length === 0) {
    console.log('      none');
  } else {
    for (const note of report.notes) {
      console.log(`      ${note}`);
    }
  }
  if (report.allowListed.length > 0) {
    console.log('');
    console.log('Allow-listed files (may contain credential-like strings on purpose)');
    for (const file of report.allowListed) {
      console.log(`      ${file}`);
    }
  }
  if (ownerEmail) {
    console.log(
      `      The e-mail address of the repository owner (${ownerEmail}) is part of the git metadata.`,
    );
    console.log('      It cannot be removed without rewriting the history.');
  }

  console.log('');
  console.log(line);
  if (failed) {
    console.log('RESULT: FAILED - credentials or sensitive files were found.');
  } else if (!clean) {
    console.log('RESULT: FAILED');
  } else {
    console.log('RESULT: PASSED - no credentials, no .env files, nothing sensitive committed.');
  }
  console.log(line);
}

main();
