import LedgerPlugin from './main';
import {
  AddExpenseModal,
  ConfirmModal,
  Operation,
  RecurringRemoveModal,
} from './modals';
import { EnhancedTransaction, parse, TransactionCache } from './parser';
import {
  advanceSchedule,
  effectiveDueDate,
  extractRecurringSection,
  formatRecurringSection,
  materializeTransaction,
  parseRecurringSection,
  RecurringTransaction,
  spliceRecurringSection,
} from './recurring';
import type { ISettings } from './settings';
import { formatTransaction, getTotal } from './transaction-utils';
import type { MetadataCache, TFile, Vault } from 'obsidian';

export class LedgerModifier {
  private readonly plugin: LedgerPlugin;
  private ledgerFile: TFile;

  constructor(plugin: LedgerPlugin, ledgerFile: TFile) {
    this.plugin = plugin;
    this.ledgerFile = ledgerFile;
  }

  public setLedgerFile(ledgerFile: TFile): void {
    this.ledgerFile = ledgerFile;
  }

  public openExpenseModal(
    operation: Operation,
    initialState?: EnhancedTransaction,
    initialRecurring?: RecurringTransaction,
  ): void {
    new AddExpenseModal(
      this.plugin,
      this,
      operation,
      initialState,
      initialRecurring,
    ).open();
  }

  /**
   * openRecurringEditModal opens the transaction form pre-filled to edit an
   * existing recurring transaction.
   */
  public openRecurringEditModal(recurring: RecurringTransaction): void {
    new AddExpenseModal(
      this.plugin,
      this,
      'modify',
      undefined,
      recurring,
    ).open();
  }

  public async updateTransaction(
    oldTx: EnhancedTransaction,
    newTx: string,
  ): Promise<void> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.cachedRead(this.ledgerFile);
    const lines = fileContents.split('\n');
    const newLines =
      lines.slice(0, oldTx.block.firstLine).join('\n') +
      newTx +
      '\n' +
      lines.slice(oldTx.block.lastLine + 1).join('\n');
    return vault.modify(this.ledgerFile, newLines);
  }

  /**
   * promptDeleteTransaction asks the user to confirm before permanently
   * deleting a transaction, so that nothing is removed by an accidental click.
   */
  public promptDeleteTransaction(tx: EnhancedTransaction): void {
    new ConfirmModal(
      this.plugin.app,
      'Delete transaction',
      `Are you sure you want to delete "${tx.value.payee}" from ${tx.value.date}? This cannot be undone.`,
      'Delete',
      () => {
        this.deleteTransaction(tx);
      },
    ).open();
  }

  public async deleteTransaction(tx: EnhancedTransaction): Promise<void> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.cachedRead(this.ledgerFile);
    const lines = fileContents.split('\n');
    let length = tx.block.lastLine - tx.block.firstLine + 1;
    if (lines[tx.block.firstLine + length] === '') {
      length++; // Attempt to prevent a double blank line
    }
    lines.splice(tx.block.firstLine, length);
    return vault.modify(this.ledgerFile, lines.join('\n'));
  }

  public async appendLedger(newExpense: string): Promise<void> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.read(this.ledgerFile);
    const newFileContents = `${fileContents}\n${newExpense}`;
    await vault.modify(this.ledgerFile, newFileContents);
  }

  /**
   * saveRecurring adds a new recurring transaction or updates an existing one
   * (matched by id).
   */
  public async saveRecurring(rt: RecurringTransaction): Promise<void> {
    const all = await this.currentRecurring();
    const index = all.findIndex((r) => r.id === rt.id);
    if (index === -1) {
      all.push(rt);
    } else {
      all[index] = rt;
    }
    await this.writeRecurring(all);
  }

  public async deleteRecurring(id: string): Promise<void> {
    const all = await this.currentRecurring();
    await this.writeRecurring(all.filter((r) => r.id !== id));
  }

  /**
   * skipRecurring advances a recurring transaction to its next occurrence
   * without creating a transaction.
   */
  public async skipRecurring(rt: RecurringTransaction): Promise<void> {
    const all = await this.currentRecurring();
    const advanced = advanceSchedule(rt);
    await this.writeRecurring(all.map((r) => (r.id === rt.id ? advanced : r)));
  }

  /**
   * acceptRecurring materializes the current occurrence of a recurring
   * transaction into the transactions, then advances the schedule.
   */
  public async acceptRecurring(rt: RecurringTransaction): Promise<void> {
    const tx = materializeTransaction(rt, this.plugin.settings.holidayCountry);
    const txStr = formatTransaction(tx, this.plugin.settings.currencySymbol);
    await this.appendLedger(txStr);
    await this.skipRecurring(rt);
  }

  /**
   * promptAcceptRecurring confirms before adding the due occurrence of a
   * recurring transaction to the ledger.
   */
  public promptAcceptRecurring(rt: RecurringTransaction): void {
    const dueDate = effectiveDueDate(rt, this.plugin.settings.holidayCountry);
    const total = getTotal(
      materializeTransaction(rt, this.plugin.settings.holidayCountry),
      this.plugin.settings.currencySymbol,
    );
    new ConfirmModal(
      this.plugin.app,
      'Add recurring transaction',
      `Add "${rt.payee}" for ${total} dated ${dueDate} to your ledger?`,
      'Add',
      () => {
        this.acceptRecurring(rt);
      },
    ).open();
  }

  /**
   * promptRemoveRecurring asks whether to skip the next occurrence or delete the
   * whole schedule.
   */
  public promptRemoveRecurring(rt: RecurringTransaction): void {
    new RecurringRemoveModal(
      this.plugin.app,
      rt,
      () => {
        this.skipRecurring(rt);
      },
      () => {
        this.deleteRecurring(rt.id);
      },
    ).open();
  }

  /**
   * currentRecurring re-reads and parses the recurring transactions directly
   * from the file so writes are always based on the latest on-disk state.
   */
  private async currentRecurring(): Promise<RecurringTransaction[]> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.read(this.ledgerFile);
    const { recurringText } = extractRecurringSection(fileContents);
    const aliases = this.plugin.txCache?.aliases ?? new Map<string, string>();
    return parseRecurringSection(recurringText, aliases).recurring;
  }

  /**
   * writeRecurring rewrites the managed recurring region from the provided list
   * of recurring transactions.
   */
  private async writeRecurring(rts: RecurringTransaction[]): Promise<void> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.read(this.ledgerFile);
    const sectionText = formatRecurringSection(
      rts,
      this.plugin.settings.currencySymbol,
    );
    const newContents = spliceRecurringSection(fileContents, sectionText);
    await vault.modify(this.ledgerFile, newContents);
  }
}

export const getTransactionCache = async (
  cache: MetadataCache,
  vault: Vault,
  settings: ISettings,
  ledgerFilePath: string,
): Promise<TransactionCache> => {
  const file = cache.getFirstLinkpathDest(ledgerFilePath, '');
  if (!file) {
    throw new Error('Ledger: Unable to find Ledger file to parse');
  }

  const fileContents = await vault.read(file);
  return parse(fileContents, settings);
};
