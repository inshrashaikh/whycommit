// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';
import {
  getConfig,
  providerLabel,
  PROVIDER_PRESETS,
  resolveBaseUrl,
  resolveModel,
  type ProviderId,
} from './config/settings';
import { processDiff } from './core/diffProcessor';
import { PromptBuilder } from './core/promptBuilder';
import { GitService } from './git/gitService';
import { createProvider, ProviderError, secretKeyFor } from './llm/provider';
import { ScmButton } from './ui/scmButton';
import { StatusBar } from './ui/statusBar';
import { sanitizeCommitMessage } from './utils/commitMessage';
import { Logger } from './utils/logger';

interface Dependencies {
  gitService: GitService;
  statusBar: StatusBar;
  promptBuilder: PromptBuilder;
  logger: Logger;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new Logger();
  const gitService = new GitService(logger);
  const statusBar = new StatusBar();
  const scmButton = new ScmButton();
  const promptBuilder = new PromptBuilder();

  const dependencies: Dependencies = { gitService, statusBar, promptBuilder, logger };

  context.subscriptions.push(logger, gitService, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('whycommit.generate', () =>
      generateCommitMessage(context, dependencies),
    ),
    vscode.commands.registerCommand('whycommit.setApiKey', () => setApiKey(context, logger)),
  );

  try {
    await gitService.initialize();
  } catch (error) {
    logger.error('Unable to initialise the built-in git extension API.', error);
  }

  const refresh = async (): Promise<void> => {
    const repository = gitService.activeRepository;
    await scmButton.update(repository);

    const config = getConfig();
    if (!config.showStatusBar) {
      statusBar.hide();
      return;
    }
    if (repository) {
      statusBar.showIdle(providerLabel(config.provider), resolveModel(config));
    } else {
      statusBar.hide();
    }
  };

  context.subscriptions.push(
    gitService.onDidChangeState(() => {
      void refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('whycommit')) {
        void refresh();
      }
    }),
  );

  await refresh();
}

export function deactivate(): void {
  // Everything is disposed through `context.subscriptions`.
}

/**
 * The main flow: staged diff -> processing -> prompt -> provider -> SCM input box.
 */
async function generateCommitMessage(
  context: vscode.ExtensionContext,
  { gitService, statusBar, promptBuilder, logger }: Dependencies,
): Promise<void> {
  const repository = gitService.activeRepository;
  if (!repository) {
    void vscode.window.showErrorMessage(
      'Whycommit: no Git repository was found. Open a folder that contains a .git directory.',
    );
    return;
  }

  const config = getConfig();
  const preset = PROVIDER_PRESETS[config.provider];

  // 1. The API key lives in the SecretStorage, never in the settings.
  const apiKey = await context.secrets.get(secretKeyFor(config.provider));
  if (preset.requiresApiKey && !apiKey) {
    logger.warn(`No ${config.provider} API key is stored in the SecretStorage.`);
    const action = await vscode.window.showWarningMessage(
      `Whycommit: no ${preset.label} API key is stored yet.`,
      'Set API Key',
    );
    if (action === 'Set API Key') {
      await setApiKey(context, logger);
    }
    return;
  }

  // 2. The staged diff (index vs HEAD).
  let rawDiff: string;
  try {
    rawDiff = await gitService.getStagedDiff(repository);
  } catch (error) {
    logger.error('Unable to read the staged diff.', error);
    void vscode.window.showErrorMessage('Whycommit: the staged changes could not be read.');
    return;
  }

  if (!rawDiff.trim()) {
    logger.info('There are no staged changes.');
    void vscode.window.showWarningMessage(
      'Whycommit: there are no staged changes. Stage your files first ("git add ...").',
    );
    return;
  }

  // 3. Reduce the diff to something that fits into the token budget.
  const processed = processDiff(rawDiff, config.maxDiffTokens);
  logger.info(
    `Processed diff: ${processed.includedFiles.length} file(s) included, ` +
      `${processed.skippedFiles.length} skipped, ${processed.truncatedFiles.length} truncated, ` +
      `~${processed.estimatedTokens} tokens.`,
  );

  // 4. Build the prompt.
  const recentCommits = await gitService.getRecentCommits(repository, config.recentCommitCount);
  const prompt = promptBuilder.build({
    diff: processed,
    branch: gitService.getCurrentBranch(repository),
    recentCommits: recentCommits
      .map((commit) => commit.subject)
      .filter((subject) => subject.length > 0),
    language: config.language,
  });

  // 5. Call the provider.
  const provider = createProvider(config.provider);
  statusBar.showBusy();

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Whycommit: generating a commit message with ${preset.label}...`,
        cancellable: true,
      },
      async (_progress, token) => {
        const controller = new AbortController();
        const cancellation = token.onCancellationRequested(() => controller.abort());
        try {
          return await provider.generate(prompt, {
            model: resolveModel(config),
            baseUrl: resolveBaseUrl(config),
            apiKey,
            temperature: config.temperature,
            maxOutputTokens: config.maxOutputTokens,
            signal: controller.signal,
          });
        } finally {
          cancellation.dispose();
        }
      },
    );

    const message = sanitizeCommitMessage(result.text);
    if (!message) {
      statusBar.showError('Empty response');
      void vscode.window.showErrorMessage(
        'Whycommit: the provider returned an empty response. Try again or pick a different model.',
      );
      return;
    }

    repository.inputBox.value = message;
    statusBar.showIdle(preset.label, result.model);
    logger.info('Commit message written to the SCM input box.');
  } catch (error) {
    const description = describeProviderError(error);
    logger.error('Failed to generate the commit message.', error);
    statusBar.showError(description);
    void vscode.window.showErrorMessage(`Whycommit: ${description}`);
  }
}

/**
 * Stores, replaces or removes an API key in the VS Code SecretStorage.
 * The key is never written to the settings, the logs or the repository.
 */
async function setApiKey(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
  const config = getConfig();
  const providerIds: ProviderId[] = ['anthropic', 'openai', 'ollama'];

  const picked = await vscode.window.showQuickPick(
    providerIds.map((id) => ({
      label: PROVIDER_PRESETS[id].label,
      description: id === config.provider ? 'active provider' : undefined,
      detail: PROVIDER_PRESETS[id].hint,
      id,
    })),
    {
      title: 'Whycommit: choose the provider for the API key',
      placeHolder: PROVIDER_PRESETS[config.provider].label,
    },
  );

  if (!picked) {
    return;
  }

  const provider = picked.id;
  const storageKey = secretKeyFor(provider);
  const existing = await context.secrets.get(storageKey);

  const action = await vscode.window.showQuickPick(
    existing ? ['Replace key', 'Remove key'] : ['Set key'],
    { title: `Whycommit: ${PROVIDER_PRESETS[provider].label}` },
  );

  if (!action) {
    return;
  }

  if (action === 'Remove key') {
    await context.secrets.delete(storageKey);
    void vscode.window.showInformationMessage(
      `Whycommit: the stored ${PROVIDER_PRESETS[provider].label} API key was removed.`,
    );
    return;
  }

  const value = await vscode.window.showInputBox({
    title: `Whycommit: ${PROVIDER_PRESETS[provider].label} API key`,
    prompt:
      'Paste your API key. It is stored in the VS Code SecretStorage and never written to settings, logs or git.',
    password: true,
    ignoreFocusOut: true,
    placeHolder: provider === 'ollama' ? 'optional for Ollama' : 'sk-...',
    validateInput: (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return 'The API key cannot be empty.';
      }
      if (trimmed.length < 8) {
        return 'That key looks too short.';
      }
      return undefined;
    },
  });

  if (value === undefined) {
    return;
  }

  await context.secrets.store(storageKey, value.trim());
  logger.info(`Stored a new ${provider} API key in the SecretStorage.`);
  void vscode.window.showInformationMessage(
    `Whycommit: the ${PROVIDER_PRESETS[provider].label} API key was stored securely.`,
  );
}

/** Turns an error into a short, actionable message for the user. */
function describeProviderError(error: unknown): string {
  if (error instanceof ProviderError) {
    switch (error.kind) {
      case 'no-api-key':
        return 'no API key is configured. Run "Whycommit: Set API Key".';
      case 'unauthorized':
        return 'the provider rejected the API key (401/403). Check the stored key.';
      case 'rate-limit':
        return 'the provider rate limit was reached (429). Try again in a moment.';
      case 'timeout':
        return 'the request to the provider timed out.';
      case 'cancelled':
        return 'the request was cancelled.';
      case 'server':
        return 'the provider returned a server error (5xx). Try again later.';
      case 'empty-response':
        return 'the provider returned an empty response.';
      case 'network':
        return 'the provider could not be reached. Check the network and the baseUrl.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
