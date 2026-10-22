// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';
import { providerIsLocal, type ProviderId } from '../config/settings';

/** Global state key that remembers whether the notice was already shown. */
export const PRIVACY_NOTICE_STATE_KEY = 'whycommit.privacyNotice.v1';

/**
 * Shows a one-time notice the first time a cloud provider is used.
 *
 * The notice explains that the staged changes leave the machine and points at
 * Ollama as the local alternative.
 */
export class PrivacyNotice {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /** True when the notice still has to be shown. */
  async shouldShow(): Promise<boolean> {
    return !(await this.context.globalState.get<boolean>(PRIVACY_NOTICE_STATE_KEY, false));
  }

  /** Remembers that the notice was shown. */
  async markShown(): Promise<void> {
    await this.context.globalState.update(PRIVACY_NOTICE_STATE_KEY, true);
  }

  /**
   * Shows the notice when a cloud provider is used for the first time.
   *
   * @returns `true` when the notice was displayed.
   */
  async showIfNeeded(provider: ProviderId): Promise<boolean> {
    if (providerIsLocal(provider)) {
      return false;
    }
    if (!(await this.shouldShow())) {
      return false;
    }

    const choice = await vscode.window.showWarningMessage(
      'Whycommit sends your staged changes to a remote AI provider to generate the commit message. ' +
        'Nothing is stored by the provider, but the code does leave your machine. ' +
        'For a fully local setup use Ollama instead.',
      'Use Ollama (local)',
      'Continue',
    );

    await this.markShown();

    if (choice === 'Use Ollama (local)') {
      await vscode.workspace
        .getConfiguration('whycommit')
        .update('provider', 'ollama', vscode.ConfigurationTarget.Global);
    }

    return true;
  }
}
