import { LedgerModifier } from './file-interface';
import LedgerPlugin from './main';
import { EnhancedTransaction } from './parser';
import { RecurringTransaction } from './recurring';
import { emptyTransaction } from './transaction-utils';
import { EditTransaction } from './ui/EditTransaction';
import { App, Modal } from 'obsidian';
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

/**
 * RecurringRemoveModal asks the user whether they want to skip just the next
 * occurrence of a recurring transaction or delete the schedule entirely.
 */
export class RecurringRemoveModal extends Modal {
  private readonly recurring: RecurringTransaction;
  private readonly onSkip: () => void;
  private readonly onDelete: () => void;

  constructor(
    app: App,
    recurring: RecurringTransaction,
    onSkip: () => void,
    onDelete: () => void,
  ) {
    super(app);
    this.recurring = recurring;
    this.onSkip = onSkip;
    this.onDelete = onDelete;
  }

  public onOpen = (): void => {
    this.titleEl.setText('Remove recurring transaction');
    this.contentEl.createEl('p', {
      text:
        'What would you like to do with the recurring transaction ' +
        `"${this.recurring.payee}"?`,
    });

    const buttonContainer = this.contentEl.createDiv({
      cls: 'modal-button-container',
    });

    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());

    const skipButton = buttonContainer.createEl('button', {
      text: 'Skip this occurrence',
    });
    skipButton.addEventListener('click', () => {
      this.onSkip();
      this.close();
    });

    const deleteButton = buttonContainer.createEl('button', {
      text: 'Delete schedule',
      cls: 'mod-warning',
    });
    deleteButton.addEventListener('click', () => {
      this.onDelete();
      this.close();
    });
  };

  public onClose = (): void => {
    this.contentEl.empty();
  };
}

/**
 * RecurringAcceptModal confirms adding an occurrence of a recurring transaction
 * and lets the user adjust the date of the transaction that will be written.
 * The schedule itself is unaffected by the chosen date.
 */
export class RecurringAcceptModal extends Modal {
  private readonly payee: string;
  private readonly total: string;
  private readonly defaultDate: string;
  private readonly onConfirm: (dateISO: string) => void;

  constructor(
    app: App,
    payee: string,
    total: string,
    defaultDate: string,
    onConfirm: (dateISO: string) => void,
  ) {
    super(app);
    this.payee = payee;
    this.total = total;
    this.defaultDate = defaultDate;
    this.onConfirm = onConfirm;
  }

  public onOpen = (): void => {
    this.titleEl.setText('Add recurring transaction');
    this.contentEl.createEl('p', {
      text: `Add "${this.payee}" for ${this.total} to your ledger.`,
    });

    const dateSetting = this.contentEl.createDiv({
      cls: 'ledger-recurring-accept-date',
    });
    dateSetting.createEl('label', { text: 'Date' });
    const dateInput = dateSetting.createEl('input', { type: 'date' });
    dateInput.value = this.defaultDate;

    const buttonContainer = this.contentEl.createDiv({
      cls: 'modal-button-container',
    });
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());

    const confirmButton = buttonContainer.createEl('button', {
      text: 'Add',
      cls: 'mod-cta',
    });
    confirmButton.addEventListener('click', () => {
      this.onConfirm(dateInput.value || this.defaultDate);
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
  private readonly initialRecurring?: RecurringTransaction;

  constructor(
    plugin: LedgerPlugin,
    updater: LedgerModifier,
    operation: Operation,
    initialState?: EnhancedTransaction,
    initialRecurring?: RecurringTransaction,
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.updater = updater;
    this.operation = operation;
    this.initialState = initialState || emptyTransaction;
    this.initialRecurring = initialRecurring;
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
        initialRecurring: this.initialRecurring,
        operation: this.operation,
        updater: this.updater,
        txCache: this.plugin.txCache,
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
