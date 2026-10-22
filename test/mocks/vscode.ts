// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

/**
 * A minimal in-memory replacement for the `vscode` module.
 *
 * Vitest resolves the `vscode` import to this file through the alias in
 * `vitest.config.ts`, so the pure modules of the extension can be unit tested
 * without a running VS Code instance.
 */

export class EventEmitter<T> {
  private readonly listeners: Array<(event: T) => void> = [];

  readonly event = (listener: (event: T) => void): Disposable => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((entry) => entry !== listener);
      },
    };
  };

  fire(event: T): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export interface Disposable {
  dispose(): void;
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
    readonly fsPath: string,
  ) {}

  static file(path: string): Uri {
    return new Uri('file', path, path);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path, ...segments].join('/').replace(/\/+/g, '/');
    return new Uri(base.scheme, joined, joined);
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

/** The values that `workspace.getConfiguration()` returns. */
export const configurationStore: Record<string, Record<string, unknown>> = {};

export function setConfiguration(section: string, values: Record<string, unknown>): void {
  configurationStore[section] = { ...(configurationStore[section] ?? {}), ...values };
}

export function resetConfiguration(): void {
  for (const key of Object.keys(configurationStore)) {
    delete configurationStore[key];
  }
}

export const outputChannels: Array<{ name: string; lines: string[] }> = [];

export const messages = {
  info: [] as string[],
  warning: [] as string[],
  error: [] as string[],
};

export const quickPickResponses: unknown[] = [];
export const inputBoxResponses: Array<string | undefined> = [];

/** Registry of fake extensions, keyed by extension id. */
export const extensionRegistry = new Map<string, unknown>();

/** Files that `workspace.fs.readFile` can read, keyed by file name. */
export const fileSystem: Record<string, Uint8Array> = {};

export const window = {
  activeTextEditor: undefined as unknown,
  createOutputChannel(name: string) {
    const channel = { name, lines: [] as string[] };
    outputChannels.push(channel);
    return {
      name,
      trace: (message: string) => channel.lines.push(message),
      debug: (message: string) => channel.lines.push(message),
      info: (message: string) => channel.lines.push(message),
      warn: (message: string) => channel.lines.push(message),
      error: (message: string) => channel.lines.push(message),
      show: () => undefined,
      dispose: () => undefined,
    };
  },
  createStatusBarItem() {
    return {
      text: '',
      tooltip: '',
      command: undefined,
      name: '',
      backgroundColor: undefined,
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    };
  },
  showInformationMessage: async (message: string) => {
    messages.info.push(message);
    return undefined;
  },
  showWarningMessage: async (message: string) => {
    messages.warning.push(message);
    return undefined;
  },
  showErrorMessage: async (message: string) => {
    messages.error.push(message);
    return undefined;
  },
  showQuickPick: async () => quickPickResponses.shift(),
  showInputBox: async () => inputBoxResponses.shift(),
  showTextDocument: async () => undefined,
  withProgress: async <T>(
    _options: unknown,
    task: (progress: unknown, token: unknown) => Promise<T>,
  ): Promise<T> =>
    task(
      { report: () => undefined },
      { onCancellationRequested: () => new Disposable(() => undefined) },
    ),
};

export const workspace = {
  getConfiguration(section: string) {
    const values = configurationStore[section] ?? {};
    return {
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        const value = values[key];
        return (value === undefined ? defaultValue : value) as T | undefined;
      },
      update: async (key: string, value: unknown) => {
        configurationStore[section] = { ...(configurationStore[section] ?? {}), [key]: value };
      },
      has: (key: string) => key in values,
    };
  },
  onDidChangeConfiguration: () => new Disposable(() => undefined),
  asRelativePath: (path: Uri | string) => String(path),
  fs: {
    readFile: async (uri: Uri) => {
      const name = uri.path.split('/').pop() ?? uri.path;
      const content = fileSystem[name];
      if (!content) {
        throw new Error(`FileNotFound: ${uri.path}`);
      }
      return content;
    },
  },
};

export const commands = {
  executeCommand: async (_command: string, ...args: unknown[]) => {
    void args;
    return undefined;
  },
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) =>
    new Disposable(() => undefined),
};

export const extensions = {
  getExtension: (id: string) => extensionRegistry.get(id),
};

export const namespace = {
  window,
  workspace,
  commands,
  extensions,
  EventEmitter,
  Uri,
  StatusBarAlignment,
  ProgressLocation,
  ConfigurationTarget,
  ThemeColor,
};

export default namespace;
