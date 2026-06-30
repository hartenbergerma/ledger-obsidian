import LedgerPlugin from './main';
import {
  AddExpenseModal,
  ConfirmModal,
  Operation,
  RecurringAcceptModal,
} from './modals';
import {
  EnhancedTransaction,
  FileBlock,
  parse,
  TransactionCache,
} from './parser';
import {
  advanceSchedule,
  effectiveDueDate,
  formatRecurringTransaction,
  insertRecurringTransaction,
  materializeTransaction,
  nextNominalDate,
  RecurringTransaction,
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
   * makeTransactionRecurring turns an existing transaction into a recurring one.
   * The transaction is rewritten in place (e.g. to add the recurring marker tag)
   * and its schedule is saved. When the schedule already exists (rt.block is
   * set) both the transaction and the schedule block are rewritten from a single
   * snapshot of the file so their line indices stay consistent; otherwise the
   * new schedule is inserted after the transaction is updated.
   */
  public async makeTransactionRecurring(
    oldTx: EnhancedTransaction,
    newTxStr: string,
    rt: RecurringTransaction,
  ): Promise<void> {
    if (rt.block) {
      const scheduleText = formatRecurringTransaction(
        rt,
        this.plugin.settings.currencySymbol,
      );
      await this.replaceBlocks([
        { block: oldTx.block, text: newTxStr },
        { block: rt.block, text: scheduleText },
      ]);
      return;
    }
    await this.updateTransaction(oldTx, newTxStr);
    await this.saveRecurring(rt);
  }

  /**
   * replaceBlocks replaces several blocks in a single read/modify so that the
   * stored line indices all refer to the same snapshot of the file. The edits
   * are applied from the bottom of the file upward so that replacing one block
   * does not shift the line numbers of the blocks above it.
   */
  private async replaceBlocks(
    edits: { block: FileBlock; text: string }[],
  ): Promise<void> {
    const vault = this.plugin.app.vault;
    let lines = (await vault.read(this.ledgerFile)).split('\n');
    const ordered = [...edits].sort(
      (a, b) => b.block.firstLine - a.block.firstLine,
    );
    ordered.forEach(({ block, text }) => {
      const insert = text.split('\n');
      // formatTransaction prefixes a leading newline (used as a separator when
      // splicing strings); drop the resulting empty first line here.
      if (insert[0] === '') {
        insert.shift();
      }
      lines = [
        ...lines.slice(0, block.firstLine),
        ...insert,
        ...lines.slice(block.lastLine + 1),
      ];
    });
    await vault.modify(this.ledgerFile, lines.join('\n'));
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
    // formatTransaction already prefixes the entry with a newline. Trim any
    // trailing whitespace from the existing file first so that exactly one blank
    // line separates the previous content from the new entry, regardless of
    // whether the file happened to end with a newline (which previously produced
    // an extra blank line).
    const trimmed = fileContents.replace(/\s+$/, '');
    const newFileContents =
      trimmed === ''
        ? newExpense.replace(/^\n+/, '')
        : `${trimmed}\n${newExpense}`;
    await vault.modify(this.ledgerFile, newFileContents);
  }

  /**
   * addRecurringToExisting turns a transaction that already exists in the file
   * into a recurring one. The existing transaction is updated in place (it stays
   * a normal transaction — no duplicate is created); only the schedule is added.
   * Its next occurrence is the first regular date after the existing
   * transaction's date.
   */
  public async addRecurringToExisting(
    oldTx: EnhancedTransaction,
    newTx: string,
    rt: RecurringTransaction,
    existingDateISO: string,
  ): Promise<void> {
    // Update the transaction first so its (pre-modification) block line numbers
    // are still valid; saveRecurring re-reads the file and inserts by content.
    await this.updateTransaction(oldTx, newTx);
    const nextDate =
      rt.nextDate === existingDateISO ? nextNominalDate(rt) : rt.nextDate;
    await this.saveRecurring({ ...rt, nextDate });
  }

  /**
   * saveRecurring writes a recurring transaction. A transaction with a `block`
   * (an existing one being edited) is replaced in place; a new one is inserted
   * into the recurring-transactions section.
   */
  public async saveRecurring(rt: RecurringTransaction): Promise<void> {
    const text = formatRecurringTransaction(
      rt,
      this.plugin.settings.currencySymbol,
    );
    if (rt.block) {
      await this.replaceBlock(rt.block, text);
      return;
    }
    const vault = this.plugin.app.vault;
    const fileContents = await vault.read(this.ledgerFile);
    await vault.modify(
      this.ledgerFile,
      insertRecurringTransaction(fileContents, text),
    );
  }

  public async deleteRecurring(rt: RecurringTransaction): Promise<void> {
    if (rt.block) {
      await this.removeBlock(rt.block);
    }
  }

  /**
   * skipRecurring advances a recurring transaction to its next occurrence
   * without creating a transaction, updating it in place.
   */
  public async skipRecurring(rt: RecurringTransaction): Promise<void> {
    await this.saveRecurring(advanceSchedule(rt));
  }

  /**
   * acceptRecurring adds an occurrence of a recurring transaction to the
   * transactions on the provided date, then advances the schedule to its next
   * regular occurrence. The chosen date only affects the created transaction —
   * the schedule's own timing is always advanced based on the schedule, even
   * when the occurrence is added before it is due.
   */
  public async acceptRecurring(
    rt: RecurringTransaction,
    dateISO: string,
  ): Promise<void> {
    const tx = materializeTransaction(rt, dateISO);
    const txStr = formatTransaction(tx, this.plugin.settings.currencySymbol);
    await this.appendLedger(txStr);
    await this.skipRecurring(rt);
  }

  /**
   * createRecurring saves a new schedule and immediately adds a first
   * transaction for the provided date. The schedule's next occurrence is set to
   * the next regular date after the one just added.
   */
  public async createRecurring(
    rt: RecurringTransaction,
    firstDateISO: string,
  ): Promise<void> {
    const tx = materializeTransaction(rt, firstDateISO);
    const txStr = formatTransaction(tx, this.plugin.settings.currencySymbol);
    await this.appendLedger(txStr);

    // The schedule's nextDate was computed as the first occurrence on or after
    // firstDateISO. If that is the date we just added, advance one more so the
    // same occurrence is not offered again.
    const nextDate =
      rt.nextDate === firstDateISO ? nextNominalDate(rt) : rt.nextDate;
    await this.saveRecurring({ ...rt, nextDate });
  }

  /**
   * promptAcceptRecurring opens a dialog to add (with an adjustable date) or
   * skip an occurrence of a recurring transaction.
   */
  public promptAcceptRecurring(rt: RecurringTransaction): void {
    const dueDate = effectiveDueDate(rt, this.plugin.settings.holidayCountry);
    const total = getTotal(
      materializeTransaction(rt, dueDate),
      this.plugin.settings.currencySymbol,
    );
    new RecurringAcceptModal(
      this.plugin.app,
      rt.payee,
      total,
      dueDate,
      (dateISO: string) => {
        this.acceptRecurring(rt, dateISO);
      },
      () => {
        this.skipRecurring(rt);
      },
    ).open();
  }

  /**
   * promptDeleteRecurring confirms before deleting a recurring schedule.
   */
  public promptDeleteRecurring(rt: RecurringTransaction): void {
    new ConfirmModal(
      this.plugin.app,
      'Delete recurring transaction',
      `Are you sure you want to delete the recurring transaction "${rt.payee}"? This cannot be undone.`,
      'Delete',
      () => {
        this.deleteRecurring(rt);
      },
    ).open();
  }

  /**
   * replaceBlock replaces the lines of an existing block in the file with the
   * provided text.
   */
  private async replaceBlock(
    block: { firstLine: number; lastLine: number },
    newText: string,
  ): Promise<void> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.read(this.ledgerFile);
    const lines = fileContents.split('\n');
    const newLines = [
      ...lines.slice(0, block.firstLine),
      ...newText.split('\n'),
      ...lines.slice(block.lastLine + 1),
    ].join('\n');
    await vault.modify(this.ledgerFile, newLines);
  }

  /**
   * removeBlock deletes the lines of an existing block from the file, including
   * a single trailing blank line if present to avoid leaving a double blank.
   */
  private async removeBlock(block: {
    firstLine: number;
    lastLine: number;
  }): Promise<void> {
    const vault = this.plugin.app.vault;
    const fileContents = await vault.read(this.ledgerFile);
    const lines = fileContents.split('\n');
    let length = block.lastLine - block.firstLine + 1;
    if (lines[block.firstLine + length] === '') {
      length++;
    }
    lines.splice(block.firstLine, length);
    await vault.modify(this.ledgerFile, lines.join('\n'));
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
