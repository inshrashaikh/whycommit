// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { execFile } from 'child_process';
import * as vscode from 'vscode';
import type { API as GitAPI, GitExtension, LogEntry, Repository } from 'vscode.git';
import { promisify } from 'util';
import { COMMITRC_FILENAMES } from '../core/commitrc';
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

  /** All repositories that the git extension knows about. */
  get repositories(): Repository[] {
    return this.gitApi?.repositories ?? [];
  }

  /** The repository that owns the active editor, if any. */
  get activeEditorRepository(): Repository | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (!activeUri || activeUri.scheme !== 'file') {
      return undefined;
    }
    return this.findRepositoryByPath(activeUri.fsPath);
  }

  /**
   * The repository Whycommit should operate on.
   *
   * In a multi-root workspace the repository of the active editor wins. When
   * there is no active editor the first repository is used; the caller can
   * disambiguate with {@link pickRepository}.
   */
  get activeRepository(): Repository | undefined {
    return this.activeEditorRepository ?? this.repositories[0];
  }

  /** Finds the repository whose root contains the given file path. */
  findRepositoryByPath(filePath: string): Repository | undefined {
    const normalized = filePath.toLowerCase();
    return this.repositories.find((repository) => {
      const root = repository.rootUri.fsPath.toLowerCase();
      return (
        normalized === root ||
        normalized.startsWith(`${root}/`) ||
        normalized.startsWith(`${root}\\`)
      );
    });
  }

  /**
   * Lets the user choose a repository when several are open.
   *
   * @returns The chosen repository, or `undefined` when the user cancels.
   */
  async pickRepository(): Promise<Repository | undefined> {
    const repositories = this.repositories;
    if (repositories.length === 0) {
      return undefined;
    }
    if (repositories.length === 1) {
      return repositories[0];
    }

    const items = repositories.map((repository) => ({
      label:
        vscode.workspace.asRelativePath(repository.rootUri, false) || repository.rootUri.fsPath,
      description: repository.state.HEAD?.name ?? repository.state.HEAD?.commit?.substring(0, 7),
      detail: repository.rootUri.fsPath,
      repository,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Whycommit: choose the repository',
      placeHolder: 'Several Git repositories are open',
    });

    return picked?.repository;
  }

  /**
   * Returns the diff of the staged changes (index vs HEAD).
   *
   * `git diff --cached` also works in a repository without any commit, so the
   * CLI fallback covers that case as well.
   */
  async getStagedDiff(repository: Repository): Promise<string> {
    try {
      const diff = await repository.diffIndexWithHEAD();
      if (typeof diff === 'string' && diff.trim().length > 0) {
        return diff;
      }
      // An empty result in a repository without commits still means "staged
      // changes exist", so the CLI fallback is used to tell both cases apart.
      if (this.hasCommits(repository)) {
        return diff ?? '';
      }
    } catch (error) {
      this.logger.debug('diffIndexWithHEAD failed, falling back to the git CLI.', error);
    }
    return this.getStagedDiffViaCli(repository);
  }

  /** True when the repository has at least one commit. */
  hasCommits(repository: Repository): boolean {
    return Boolean(repository.state.HEAD?.commit);
  }

  /** True when the repository is checked out at a detached HEAD. */
  isDetachedHead(repository: Repository): boolean {
    const head = repository.state.HEAD;
    return Boolean(head && !head.name && head.commit);
  }

  /** Returns the most recent commits, newest first. */
  async getRecentCommits(repository: Repository, count: number): Promise<CommitReference[]> {
    if (count <= 0 || !this.hasCommits(repository)) {
      return [];
    }
    try {
      const entries = await repository.log({ maxEntries: count });
      return entries.map((entry: LogEntry) => ({
        hash: entry.commit.substring(0, 7),
        subject: entry.message.split('\n')[0].trim(),
        author: entry.authorName ?? 'unknown',
        date: entry.date instanceof Date ? entry.date.toISOString() : '',
      }));
    } catch (error) {
      this.logger.debug('Unable to read the commit log.', error);
      return [];
    }
  }

  /**
   * Returns the name of the branch that is currently checked out.
   *
   * Detached HEADs are reported as `detached@<short hash>` and a repository
   * without any commit as `unknown`.
   */
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

  /**
   * Returns the upstream branch of the current branch, if the repository has a
   * remote at all. Repositories without a remote simply return `undefined`.
   */
  async getUpstreamBranch(repository: Repository): Promise<string | undefined> {
    const head = repository.state.HEAD;
    if (!head?.name || !this.hasCommits(repository)) {
      return undefined;
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        {
          cwd: repository.rootUri.fsPath,
          windowsHide: true,
        },
      );
      const upstream = stdout.trim();
      return upstream.length > 0 ? upstream : undefined;
    } catch {
      // No remote, no upstream, or the branch does not track anything.
      return undefined;
    }
  }

  /**
   * Reads the `.commitrc` file of a repository, if there is one.
   *
   * @returns The raw file contents, or `undefined` when there is no such file.
   */
  async readCommitrc(repository: Repository): Promise<string | undefined> {
    for (const filename of COMMITRC_FILENAMES) {
      const uri = vscode.Uri.joinPath(repository.rootUri, filename);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString('utf8');
      } catch {
        // File does not exist or cannot be read - try the next candidate.
      }
    }
    return undefined;
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
