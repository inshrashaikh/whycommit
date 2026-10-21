// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { execFile } from 'child_process';
import * as vscode from 'vscode';
import type { API as GitAPI, GitExtension, LogEntry, Repository } from 'vscode.git';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface CommitReference {
  /** Short commit hash. */
  hash: string;
  /** First line of the commit message. */
  subject: string;
  /** Author display name. */
  author: string;
  /** ISO date of the commit. */
  date: string;
}

/**
 * Thin wrapper around the built-in `vscode.git` extension API.
 *
 * Everything Whycommit needs from git (repository detection, the staged diff,
 * the recent commit log and the current branch) is read through that API so the
 * extension never has to shell out to a second git implementation.
 */
export class GitService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly stateEmitter = new vscode.EventEmitter<unknown>();
  private gitApi: GitAPI | undefined;

  constructor(private readonly logger: Logger) {}

  /** Activates the built-in git extension and captures its API. */
  async initialize(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) {
      throw new Error(
        "The built-in 'vscode.git' extension is not available in this VS Code build.",
      );
    }

    const gitExtension = extension.isActive ? extension.exports : await extension.activate();
    this.gitApi = gitExtension.getAPI(1);

    this.disposables.push(
      this.gitApi.onDidChangeState(() => {
        this.logger.debug('Git state changed.');
        this.stateEmitter.fire(undefined);
      }),
    );
  }

  /** Fires whenever the git extension reports a state change. */
  get onDidChangeState(): vscode.Event<unknown> {
    return this.stateEmitter.event;
  }

  /** Returns the repository Whycommit should operate on. */
  get activeRepository(): Repository | undefined {
    const repositories = this.gitApi?.repositories ?? [];
    if (repositories.length === 0) {
      return undefined;
    }

    // Prefer the repository that owns the active editor.
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri && activeUri.scheme === 'file') {
      const activePath = activeUri.fsPath.toLowerCase();
      const match = repositories.find((repository) => {
        const root = repository.rootUri.fsPath.toLowerCase();
        return (
          activePath === root ||
          activePath.startsWith(`${root}/`) ||
          activePath.startsWith(`${root}\\`)
        );
      });
      if (match) {
        return match;
      }
    }

    return repositories[0];
  }

  /**
   * Returns the diff of the staged changes (index vs HEAD).
   *
   * Falls back to the git CLI when the repository has no commits yet, because
   * `diffIndexWithHEAD` cannot resolve `HEAD` in that situation.
   */
  async getStagedDiff(repository: Repository): Promise<string> {
    try {
      return await repository.diffIndexWithHEAD();
    } catch (error) {
      this.logger.debug('diffIndexWithHEAD failed, falling back to the git CLI.', error);
      return this.getStagedDiffViaCli(repository);
    }
  }

  /** Returns the most recent commits, newest first. */
  async getRecentCommits(repository: Repository, count: number): Promise<CommitReference[]> {
    if (count <= 0) {
      return [];
    }
    try {
      const entries = await repository.log({ maxEntries: count });
      return entries.map((entry: LogEntry) => ({
        hash: entry.commit.substring(0, 7),
        subject: entry.message.split('\n')[0].trim(),
        author: entry.authorName ?? 'unknown',
        date: entry.date ? entry.date.toISOString() : '',
      }));
    } catch (error) {
      this.logger.debug('Unable to read the commit log.', error);
      return [];
    }
  }

  /** Returns the name of the branch that is currently checked out. */
  getCurrentBranch(repository: Repository): string {
    const head = repository.state.HEAD;
    if (!head) {
      return 'unknown';
    }
    if (head.name) {
      return head.name;
    }
    if (head.commit) {
      return `detached@${head.commit.substring(0, 7)}`;
    }
    return 'unknown';
  }

  private async getStagedDiffViaCli(repository: Repository): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--cached', '--no-color', '--no-ext-diff'],
        {
          cwd: repository.rootUri.fsPath,
          maxBuffer: 32 * 1024 * 1024,
          windowsHide: true,
        },
      );
      return stdout;
    } catch (error) {
      this.logger.error('Unable to read the staged diff.', error);
      return '';
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.stateEmitter.dispose();
  }
}
