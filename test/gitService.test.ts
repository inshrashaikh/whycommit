// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EventEmitter,
  Uri,
  extensionRegistry,
  fileSystem,
  quickPickResponses,
} from './mocks/vscode';
import { GitService } from '../src/git/gitService';
import { Logger } from '../src/utils/logger';

interface FakeRepositoryOptions {
  root: string;
  head?: { name?: string; commit?: string };
  diff?: string;
  log?: Array<{ commit: string; message: string; authorName?: string; date?: Date }>;
}

function createRepository(options: FakeRepositoryOptions): Record<string, unknown> {
  return {
    rootUri: Uri.file(options.root),
    inputBox: { value: '' },
    state: {
      HEAD: options.head,
      onDidChange: new EventEmitter<void>().event,
    },
    diffIndexWithHEAD: vi.fn(async () => options.diff ?? ''),
    log: vi.fn(async () => options.log ?? []),
  };
}

function registerGitExtension(repositories: Array<Record<string, unknown>>): void {
  const stateEmitter = new EventEmitter<number>();
  extensionRegistry.set('vscode.git', {
    isActive: true,
    exports: {
      getAPI: () => ({
        repositories,
        onDidChangeState: stateEmitter.event,
      }),
    },
    activate: async () => ({
      getAPI: () => ({
        repositories,
        onDidChangeState: stateEmitter.event,
      }),
    }),
  });
}

let service: GitService;

beforeEach(() => {
  quickPickResponses.length = 0;
  for (const key of Object.keys(fileSystem)) {
    delete fileSystem[key];
  }
});

afterEach(() => {
  service?.dispose();
  extensionRegistry.clear();
  vi.restoreAllMocks();
});

describe('GitService', () => {
  it('fails when the built-in git extension is missing', async () => {
    service = new GitService(new Logger());
    await expect(service.initialize()).rejects.toThrow('vscode.git');
  });

  it('reports an empty repository list', async () => {
    registerGitExtension([]);
    service = new GitService(new Logger());
    await service.initialize();

    expect(service.repositories).toEqual([]);
    expect(service.activeRepository).toBeUndefined();
  });

  it('returns the first repository when there is no active editor', async () => {
    const first = createRepository({ root: 'C:/a', head: { name: 'main', commit: 'abc' } });
    const second = createRepository({ root: 'C:/b', head: { name: 'main', commit: 'def' } });
    registerGitExtension([first, second]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(service.activeRepository).toBe(first);
  });

  it('prefers the repository of the active editor', async () => {
    const first = createRepository({ root: 'C:/a', head: { name: 'main', commit: 'abc' } });
    const second = createRepository({ root: 'C:/b', head: { name: 'main', commit: 'def' } });
    registerGitExtension([first, second]);

    service = new GitService(new Logger());
    await service.initialize();

    const vscode = await import('vscode');
    vscode.window.activeTextEditor = {
      document: { uri: Uri.file('C:/b/src/index.ts') },
    } as never;

    expect(service.activeRepository).toBe(second);

    vscode.window.activeTextEditor = undefined as never;
  });

  it('lets the user pick a repository when several are open', async () => {
    const first = createRepository({ root: 'C:/a', head: { name: 'main', commit: 'abc' } });
    const second = createRepository({ root: 'C:/b', head: { name: 'main', commit: 'def' } });
    registerGitExtension([first, second]);

    service = new GitService(new Logger());
    await service.initialize();

    quickPickResponses.push({ label: 'b', repository: second });

    const picked = await service.pickRepository();
    expect(picked).toBe(second);
  });

  it('does not ask when only one repository is open', async () => {
    const only = createRepository({ root: 'C:/a', head: { name: 'main', commit: 'abc' } });
    registerGitExtension([only]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(await service.pickRepository()).toBe(only);
  });

  it('reads the staged diff through the git API', async () => {
    const repository = createRepository({
      root: 'C:/a',
      head: { name: 'main', commit: 'abc' },
      diff: 'diff --git a/a.ts b/a.ts\n',
    });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    const diff = await service.getStagedDiff(repository as never);
    expect(diff).toContain('diff --git');
    expect(repository.diffIndexWithHEAD).toHaveBeenCalled();
  });

  it('reports the branch name', async () => {
    const repository = createRepository({
      root: 'C:/a',
      head: { name: 'feature/x', commit: 'abcdef1234' },
    });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(service.getCurrentBranch(repository as never)).toBe('feature/x');
  });

  it('reports a detached HEAD', async () => {
    const repository = createRepository({
      root: 'C:/a',
      head: { commit: 'abcdef1234567' },
    });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(service.getCurrentBranch(repository as never)).toBe('detached@abcdef1');
    expect(service.isDetachedHead(repository as never)).toBe(true);
  });

  it('reports unknown for a repository without any commit', async () => {
    const repository = createRepository({ root: 'C:/a' });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(service.getCurrentBranch(repository as never)).toBe('unknown');
    expect(service.hasCommits(repository as never)).toBe(false);
    expect(service.isDetachedHead(repository as never)).toBe(false);
  });

  it('returns no commits for a repository without a HEAD', async () => {
    const repository = createRepository({ root: 'C:/a' });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(await service.getRecentCommits(repository as never, 10)).toEqual([]);
    expect(repository.log).not.toHaveBeenCalled();
  });

  it('maps the commit log into short references', async () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const repository = createRepository({
      root: 'C:/a',
      head: { name: 'main', commit: 'abc' },
      log: [
        {
          commit: 'abcdef1234567',
          message: 'feat: add thing\n\nthe body',
          authorName: 'Dev',
          date,
        },
      ],
    });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    const commits = await service.getRecentCommits(repository as never, 10);
    expect(commits).toEqual([
      {
        hash: 'abcdef1',
        subject: 'feat: add thing',
        author: 'Dev',
        date: '2026-01-02T03:04:05.000Z',
      },
    ]);
  });

  it('returns no upstream for a repository without a remote', async () => {
    const repository = createRepository({
      root: 'C:/this-path-does-not-exist-whycommit',
      head: { name: 'main', commit: 'abc' },
    });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(await service.getUpstreamBranch(repository as never)).toBeUndefined();
  });

  it('returns no upstream for a detached HEAD', async () => {
    const repository = createRepository({
      root: 'C:/a',
      head: { commit: 'abcdef1234567' },
    });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(await service.getUpstreamBranch(repository as never)).toBeUndefined();
  });

  it('reads the .commitrc file of the repository', async () => {
    const repository = createRepository({ root: 'C:/a', head: { name: 'main', commit: 'abc' } });
    registerGitExtension([repository]);

    fileSystem['.commitrc'] = new TextEncoder().encode('{"types":["feat"]}');

    service = new GitService(new Logger());
    await service.initialize();

    const content = await service.readCommitrc(repository as never);
    expect(content).toBe('{"types":["feat"]}');
  });

  it('returns undefined when there is no .commitrc file', async () => {
    const repository = createRepository({ root: 'C:/a', head: { name: 'main', commit: 'abc' } });
    registerGitExtension([repository]);

    service = new GitService(new Logger());
    await service.initialize();

    expect(await service.readCommitrc(repository as never)).toBeUndefined();
  });
});
