// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';
import {
  getConfig,
  providerLabel,
  PROVIDER_ORDER,
  PROVIDER_PRESETS,
  resolveBaseUrl,
  resolveModel,
  type WhycommitConfig,
} from './config/settings';
import { parseCommitrc } from './core/commitrc';
import { processDiff } from './core/diffProcessor';
import { PromptBuilder } from './core/promptBuilder';
import { scanSecrets } from './core/secretScanner';
import { detectStyle } from './core/styleDetector';
import { GitService } from './git/gitService';
import { createProvider, ProviderError, secretKeyFor } from './llm/provider';
import { withRetry } from './llm/retry';
import { PrivacyNotice } from './ui/privacyNotice';
import { ScmButton } from './ui/scmButton';
import { StatusBar } from './ui/statusBar';
import { sanitizeCommitMessage } from './utils/commitMessage';
import { Logger } from './utils/logger';
import { RuleBasedProvider } from './llm/ruleBased';
import { VsCodeLmProvider } from './llm/vscodeLm';

interface Dependencies {
  gitService: GitService;
  statusBar: StatusBar;
  promptBuilder: PromptBuilder;
  privacyNotice: PrivacyNotice;
  logger: Logger;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new Logger();
  const gitService = new GitService(logger);
  const statusBar = new StatusBar();
  const scmButton = new ScmButton();
  const promptBuilder = new PromptBuilder();
  const privacyNotice = new PrivacyNotice(context);

  const dependencies: Dependencies = {
    gitService,
    statusBar,
    promptBuilder,
    privacyNotice,
    logger,
  };

  context.subscriptions.push(logger, gitService, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('whycommit.generate', () =>
      generateCommitMessage(context, dependencies),
    ),
    vscode.commands.registerCommand('whycommit.setApiKey', () => setApiKey(context, logger)),
    vscode.commands.registerCommand('whycommit.selectProvider', () => selectProvider(logger)),
    vscode.commands.registerCommand('whycommit.showOutput', () => logger.show()),
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
  { gitService, statusBar, promptBuilder, privacyNotice, logger }: Dependencies,
): Promise<void> {
  // In a multi-root workspace the user picks the repository.
  const repository = await gitService.pickRepository();
  if (!repository) {
    void vscode.window.showErrorMessage(
      'Whycommit: no Git repository was found. Open a folder that contains a .git directory.',
    );
    return;
  }

  const config = getConfig();
  let effectiveProvider = config.provider;
  
  // Auto resolution
  if (effectiveProvider === 'auto') {
    // Check for API keys in common providers or Ollama
    const ollamaKey = await context.secrets.get(secretKeyFor('ollama'));
    const anthropicKey = await context.secrets.get(secretKeyFor('anthropic'));
    const hasApiKey = !!(ollamaKey || anthropicKey || (await context.secrets.get(secretKeyFor('openai'))));
    // Try Ollama if available
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        effectiveProvider = 'ollama';
      } else if (hasApiKey) {
        effectiveProvider = config.provider === 'auto' ? 'anthropic' : config.provider; // fallback
      } else {
        // Try VS Code LM
        try {
          const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
          if (models.length > 0) {
            effectiveProvider = 'vscode-lm';
          } else {
            effectiveProvider = 'rulebased';
          }
        } catch {
          effectiveProvider = 'rulebased';
        }
      }
    } catch {
      try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (models.length > 0) {
          effectiveProvider = 'vscode-lm';
        } else if (hasApiKey) {
          effectiveProvider = 'anthropic';
        } else {
          effectiveProvider = 'rulebased';
        }
      } catch {
        effectiveProvider = 'rulebased';
      }
    }
  }
  
  const preset = PROVIDER_PRESETS[effectiveProvider as keyof typeof PROVIDER_PRESETS] || PROVIDER_PRESETS[config.provider];

  // First-run experience
  const firstRunKey = 'whycommit.firstRunShown';
  if (!(context.globalState.get(firstRunKey) as boolean)) {
    void vscode.window.showInformationMessage(
      'Whycommit works offline. Add an API key or Ollama for smarter messages.',
      'Set API Key',
      'Use Ollama',
    ).then((action) => {
      if (action === 'Set API Key') {
        void setApiKey(context, logger);
      } else if (action === 'Use Ollama') {
        void vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai'));
      }
    });
    await context.globalState.update(firstRunKey, true);
  }

  // 0. The very first cloud request is announced to the user.
  if (effectiveProvider !== 'rulebased' && effectiveProvider !== 'vscode-lm') {
    await privacyNotice.showIfNeeded(effectiveProvider);
  }

  // 1. The API key lives in the SecretStorage, never in the settings.
  const apiKey = await context.secrets.get(secretKeyFor(effectiveProvider));
  if (preset.requiresApiKey && !apiKey) {
    logger.warn(`No ${effectiveProvider} API key is stored in the SecretStorage.`);
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

  // 4. Never send credentials to a remote model.
  const scan = scanSecrets(processed.text);
  let diffForPrompt = processed;
  if (scan.findings.length > 0) {
    diffForPrompt = { ...processed, text: scan.redactedText };
    logger.warn(
      `The staged diff contains ${scan.findings.length} possible credential(s) (highest severity: ${scan.severity}). They were redacted before sending.`,
    );
    void vscode.window.showWarningMessage(
      `Whycommit: ${scan.findings.length} possible credential(s) were found in the staged changes and were redacted before sending.`,
    );
  }

  // 5. Build the prompt.
  const recentCommits = await gitService.getRecentCommits(repository, config.recentCommitCount);
  const subjects = recentCommits
    .map((commit) => commit.subject)
    .filter((subject) => subject.length > 0);
  const style = detectStyle(subjects);

  const commitrcContent = await gitService.readCommitrc(repository);
  const commitrc = commitrcContent ? parseCommitrc(commitrcContent) : undefined;
  if (commitrc && !commitrc.valid) {
    logger.warn(`The .commitrc file of the repository is invalid: ${commitrc.errors.join(' ')}`);
  }
  if (commitrc?.warnings.length) {
    logger.warn(
      `The .commitrc file of the repository has warnings: ${commitrc.warnings.join(' ')}`,
    );
  }

  const prompt = promptBuilder.build({
    diff: diffForPrompt,
    branch: gitService.getCurrentBranch(repository),
    recentCommits: subjects,
    language: config.language,
    style,
    commitrc: commitrc?.config ?? null,
    detectedTypes: style.types,
    detectedScopes: style.scopes,
  });

  // 6. Call the provider.
  let provider: any;
  try {
    if (effectiveProvider === 'rulebased') {
      provider = new RuleBasedProvider();
    } else if (effectiveProvider === 'vscode-lm') {
      provider = new VsCodeLmProvider();
    } else {
      provider = createProvider(effectiveProvider as any);
    }
  } catch {
    provider = new RuleBasedProvider();
  }
  
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
          return await withRetry(
            () =>
              provider.generate(prompt, {
                model: resolveModel({ ...config, provider: effectiveProvider as any }),
                baseUrl: resolveBaseUrl({ ...config, provider: effectiveProvider as any }),
                apiKey,
                temperature: config.temperature,
                maxOutputTokens: config.maxOutputTokens,
                signal: controller.signal,
              }),
            {
              maxAttempts: config.maxRetries + 1,
              signal: controller.signal,
              onRetry: (info) => {
                logger.warn(
                  `The provider returned ${info.error.kind}. Retrying in ${info.delayMs} ms (attempt ${info.nextAttempt}).`,
                );
              },
            },
          );
        } catch (error) {
          // Fallback chain
          if (effectiveProvider !== 'rulebased') {
            logger.info('Falling back to rule-based provider...');
            const fallback = new RuleBasedProvider();
            try {
              return await fallback.generate(prompt, {
                model: 'rule-based',
                baseUrl: '',
                apiKey: undefined,
                temperature: config.temperature,
                maxOutputTokens: config.maxOutputTokens,
                signal: controller.signal,
              });
            } catch {
              throw error;
            }
          }
          throw error;
        } finally {
          cancellation.dispose();
        }
      },
    );

    const resultAny = result as any;
    const message = sanitizeCommitMessage(resultAny.text);
    if (!message) {
      statusBar.showError('Empty response');
      void vscode.window.showErrorMessage(
        'Whycommit: the provider returned an empty response. Try again or pick a different model.',
      );
      return;
    }

    repository.inputBox.value = message;
    statusBar.showIdle(`${preset.label} (${resultAny.model})`, resultAny.model);
    logger.info(`Commit message written to the SCM input box. Engine: ${resultAny.model}`);
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'cancelled') {
      logger.info('The generation was cancelled by the user.');
      statusBar.showIdle(`${preset.label} (${resolveModel({ ...config, provider: effectiveProvider as any })})`, resolveModel({ ...config, provider: effectiveProvider as any }));
      return;
    }

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

  const picked = await vscode.window.showQuickPick(
    PROVIDER_ORDER.map((id) => ({
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
    placeHolder: PROVIDER_PRESETS[provider].requiresApiKey ? 'sk-...' : 'optional for Ollama',
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

/**
 * Picks a provider preset and fills in its base URL and default model.
 */
async function selectProvider(logger: Logger): Promise<void> {
  const config = getConfig();

  const picked = await vscode.window.showQuickPick(
    PROVIDER_ORDER.map((id) => ({
      label: PROVIDER_PRESETS[id].label,
      description: id === config.provider ? 'active' : undefined,
      detail: PROVIDER_PRESETS[id].hint,
      id,
    })),
    {
      title: 'Whycommit: choose a provider preset',
      placeHolder: PROVIDER_PRESETS[config.provider].label,
    },
  );

  if (!picked) {
    return;
  }

  const preset = PROVIDER_PRESETS[picked.id];
  const section = vscode.workspace.getConfiguration('whycommit');

  await section.update('provider', preset.id, vscode.ConfigurationTarget.Global);

  if (preset.id === 'custom') {
    const baseUrl = await vscode.window.showInputBox({
      title: 'Whycommit: custom endpoint',
      prompt: 'Base URL of the OpenAI-compatible endpoint.',
      value: config.baseUrl,
      ignoreFocusOut: true,
      placeHolder: 'https://example.com/v1',
      validateInput: (input: string) =>
        /^https?:\/\/.+/.test(input.trim())
          ? undefined
          : 'The base URL must start with http:// or https://',
    });
    if (baseUrl === undefined) {
      return;
    }
    await section.update('baseUrl', baseUrl.trim(), vscode.ConfigurationTarget.Global);

    const model = await vscode.window.showInputBox({
      title: 'Whycommit: custom model',
      prompt: 'Model id that the endpoint expects.',
      value: config.model,
      ignoreFocusOut: true,
      placeHolder: 'my-model',
    });
    if (model === undefined) {
      return;
    }
    await section.update('model', model.trim(), vscode.ConfigurationTarget.Global);
  } else {
    await section.update('baseUrl', preset.defaultBaseUrl, vscode.ConfigurationTarget.Global);
    await section.update('model', preset.defaultModel, vscode.ConfigurationTarget.Global);
  }

  logger.info(`Switched the provider to "${preset.label}".`);
  void vscode.window.showInformationMessage(
    `Whycommit: the provider is now "${preset.label}".` +
      (preset.requiresApiKey ? ' Store the API key with "Whycommit: Set API Key".' : ''),
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

/** Exposed for the tests: resolves the settings of a provider preset. */
export function describeConfig(config: WhycommitConfig): string {
  return `${providerLabel(config.provider)} (${resolveModel(config)}) at ${resolveBaseUrl(config)}`;
}
