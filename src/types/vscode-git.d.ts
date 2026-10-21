// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * Minimal ambient typings for the built-in `vscode.git` extension API.
 *
 * The upstream API is not part of the `@types/vscode` package, so the subset
 * that Whycommit relies on is declared here. The shapes mirror the upstream
 * `extensions/git/src/git.d.ts` contract.
 */
declare module 'vscode.git' {
  export interface GitExtension {
    /** True when the git extension is enabled. */
    readonly enabled: boolean;
    /** Fires when the git extension is enabled or disabled. */
    readonly onDidChangeEnablement: import('vscode').Event<boolean>;
    /** Returns the API of the git extension. */
    getAPI(version: 1): API;
  }

  export interface API {
    /** Current state of the git extension. */
    readonly state: number;
    /** Fires whenever the repositories change. */
    readonly onDidChangeState: import('vscode').Event<number>;
    /** All known repositories. */
    readonly repositories: Repository[];
    /** Returns the API of the git extension. */
    getAPI(version: 1): API;
  }

  export interface Repository {
    /** Root folder of the repository. */
    readonly rootUri: import('vscode').Uri;
    /** The SCM input box of this repository. */
    readonly inputBox: InputBox;
    /** Current state of the repository. */
    readonly state: RepositoryState;
    /** Fires when the repository state changes. */
    readonly onDidChange: import('vscode').Event<void>;

    /** Diff of the staged changes against HEAD. */
    diffIndexWithHEAD(): Promise<string>;
    /** Diff of the working tree against HEAD. */
    diffWithHEAD(): Promise<string>;
    /** Diff of the staged changes against a ref. */
    diffIndexWith(ref: string): Promise<string>;
    /** Commit log of the repository. */
    log(options?: LogOptions): Promise<LogEntry[]>;
  }

  export interface RepositoryState {
    /** The currently checked out branch or commit. */
    readonly HEAD: Branch | undefined;
    /** Fires when the repository state changes. */
    readonly onDidChange: import('vscode').Event<void>;
  }

  export interface Ref {
    readonly name?: string;
    readonly commit?: string;
    readonly remote?: string;
  }

  export interface Branch extends Ref {
    readonly upstream?: Ref;
  }

  export interface LogOptions {
    /** Only include commits that touched this path. */
    path?: string;
    /** Maximum number of entries to return. */
    maxEntries?: number;
  }

  export interface LogEntry {
    readonly commit: string;
    readonly parent?: string;
    readonly authorName?: string;
    readonly authorEmail?: string;
    readonly authorDate?: Date;
    readonly date?: Date;
    readonly message: string;
  }

  export interface InputBox {
    readonly visible: boolean;
    /** The current value of the input box. */
    value: string;
    readonly placeholder: string | undefined;
    readonly enabled: boolean;
    readonly validationMessage: string | undefined;
    show?(): void;
    hide?(): void;
    readonly onDidChange: import('vscode').Event<string>;
    readonly onDidAccept: import('vscode').Event<void>;
    readonly onDidHide: import('vscode').Event<void>;
  }
}
