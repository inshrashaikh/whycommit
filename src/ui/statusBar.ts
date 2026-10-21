// Copyright (c) 2026 Shaikh Inshra. All rights reserved.
// Proprietary - see LICENSE. No copying, modification, distribution or reuse permitted.

import * as vscode from 'vscode';

/**
 * Small status bar item that surfaces the state of Whycommit.
 */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'whycommit.generate';
    this.item.name = 'Whycommit';
  }

  /** Shows the idle state with the active provider and model. */
  showIdle(provider: string, model: string): void {
    this.item.text = '$(sparkle) Whycommit';
    this.item.tooltip = `Whycommit\nProvider: ${provider}\nModel: ${model}\n\nClick to generate a commit message.`;
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  /** Shows the busy state while a request is running. */
  showBusy(): void {
    this.item.text = '$(sync~spin) Whycommit';
    this.item.tooltip = 'Whycommit is generating a commit message...';
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  /** Shows the error state. */
  showError(message: string): void {
    this.item.text = '$(warning) Whycommit';
    this.item.tooltip = `Whycommit failed\n${message}`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.show();
  }

  /** Hides the item. */
  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
