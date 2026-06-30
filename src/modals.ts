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
 * RecurringAcceptModal lets the user add an occurrence of a recurring
 * transaction (adjusting its date) or skip the occurrence. In both cases the
 * schedule advances to its next regular occurrence; the chosen date only affects
 * the transaction that is written when adding.
 */
export class RecurringAcceptModal extends Modal {
  private readonly payee: string;
  private readonly total: string;
  private readonly defaultDate: string;
  private readonly onAdd: (dateISO: string) => void;
  private readonly onSkip: () => void;

  constructor(
    app: App,
    payee: string,
    total: string,
    defaultDate: string,
    onAdd: (dateISO: string) => void,
    onSkip: () => void,
  ) {
    super(app);
    this.payee = payee;
    this.total = total;
    this.defaultDate = defaultDate;
    this.onAdd = onAdd;
    this.onSkip = onSkip;
  }

  public onOpen = (): void => {
    this.titleEl.setText('Add or skip recurring transaction');
    this.contentEl.createEl('p', {
      text: `Add "${this.payee}" for ${this.total} to your ledger, or skip this occurrence.`,
    });

    const dateSetting = this.contentEl.createDiv({
      cls: 'ledger-recurring-accept-date',
    });
    dateSetting.style.display = 'flex';
    dateSetting.style.alignItems = 'center';
    dateSetting.style.gap = '10px';
    dateSetting.style.margin = '12px 0';
    const dateLabel = dateSetting.createEl('label', { text: 'Date' });
    dateLabel.style.flexShrink = '0';
    const dateInput = dateSetting.createEl('input', { type: 'date' });
    // Keep the date field only as wide as the date itself needs.
    dateInput.style.flex = '0 0 auto';
    dateInput.style.width = 'auto';
    dateInput.value = this.defaultDate;

    const buttonContainer = this.contentEl.createDiv({
      cls: 'modal-button-container',
    });

    // No explicit Cancel button: the modal's own "×" in the top-right corner
    // already dismisses the dialog, so a Cancel button would be redundant.
    const skipButton = buttonContainer.createEl('button', { text: 'Skip' });
    skipButton.addEventListener('click', () => {
      this.onSkip();
      this.close();
    });

    const addButton = buttonContainer.createEl('button', {
      text: 'Add',
      cls: 'mod-cta',
    });
    addButton.addEventListener('click', () => {
      this.onAdd(dateInput.value || this.defaultDate);
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
