// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';
import type { Repository } from 'vscode.git';

/** Context key that controls the visibility of the SCM title bar button. */
export const HAS_REPOSITORY_CONTEXT = 'whycommit.hasRepository';

/**
 * Manages the Source Control title bar button.
 *
 * The button itself is contributed declaratively through `package.json`
 * (`menus.scm/title`); this class only keeps the `whycommit.hasRepository`
 * context key in sync so the button is hidden when no repository is open.
 */
export class ScmButton {
  /** Updates the context key based on the currently available repository. */
  async update(repository: Repository | undefined): Promise<void> {
    await vscode.commands.executeCommand('setContext', HAS_REPOSITORY_CONTEXT, Boolean(repository));
  }
}
