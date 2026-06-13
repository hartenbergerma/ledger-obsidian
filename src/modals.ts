import { LedgerModifier } from './file-interface';
import LedgerPlugin from './main';
import { EnhancedTransaction } from './parser';
import { emptyTransaction } from './transaction-utils';
import { EditTransaction } from './ui/EditTransaction';
import { App, Modal, Notice } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';

export type Operation = 'new' | 'clone' | 'modify';

/**
 * ConfirmModal presents a simple confirmation dialog with a cancel and a
 * confirm button. The provided callback is only invoked if the user clicks the
 * confirm button.
 */
export class ConfirmModal extends Modal {
  private readonly titleText: string;
  private readonly bodyText: string;
  private readonly confirmText: string;
  private readonly onConfirm: () => void;

  constructor(
    app: App,
    titleText: string,
    bodyText: string,
    confirmText: string,
    onConfirm: () => void,
  ) {
    super(app);
    this.titleText = titleText;
    this.bodyText = bodyText;
    this.confirmText = confirmText;
    this.onConfirm = onConfirm;
  }

  public onOpen = (): void => {
    this.titleEl.setText(this.titleText);
    this.contentEl.createEl('p', { text: this.bodyText });

    const buttonContainer = this.contentEl.createDiv({
      cls: 'modal-button-container',
    });
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());

    const confirmButton = buttonContainer.createEl('button', {
      text: this.confirmText,
      cls: 'mod-warning',
    });
    confirmButton.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  };

  public onClose = (): void => {
    this.contentEl.empty();
  };
}

export class AddExpenseModal extends Modal {
  private readonly plugin: LedgerPlugin;
  private readonly updater: LedgerModifier;
  private readonly operation: Operation;
  private readonly initialState: EnhancedTransaction;

  constructor(
    plugin: LedgerPlugin,
    updater: LedgerModifier,
    operation: Operation,
    initialState?: EnhancedTransaction,
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.updater = updater;
    this.operation = operation;
    this.initialState = initialState || emptyTransaction;
  }

  public onOpen = (): void => {
    // Scoped classes so the mobile positioning overrides in styles.css only
    // affect this modal.
    this.modalEl.addClass('ledger-modal');
    this.containerEl.addClass('ledger-modal-container');

    ReactDOM.render(
      React.createElement(EditTransaction, {
        displayFileWarning:
          !this.plugin.settings.ledgerFile.endsWith('.ledger'),
        currencySymbol: this.plugin.settings.currencySymbol,
        initialState: this.initialState,
        operation: this.operation,
        updater: this.updater,
        txCache: this.plugin.txCache,
        payeeAccountDefaults: this.plugin.settings.payeeAccountDefaults,
        savePayeeAccountDefault: (payee: string, accounts: string[]): void => {
          this.plugin.settings.payeeAccountDefaults[payee] = accounts;
          this.plugin.saveData(this.plugin.settings);
          new Notice(`Saved default accounts for "${payee}"`);
        },
        close: () => this.close(),
      }),
      this.contentEl,
    );
  };

  public onClose = (): void => {
    ReactDOM.unmountComponentAtNode(this.contentEl);
    this.contentEl.empty();
  };
}
