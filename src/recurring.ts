import grammar from '../grammar/ledger';
import { Error as LedgerError } from './error';
import { nextWorkday } from './holidays';
import type {
  Commentline,
  EnhancedExpenseLine,
  EnhancedTransaction,
  Expenseline,
  FileBlock,
} from './parser';
import {
  dealiasAccount,
  formatComment,
  formatExpenseLines,
  getMemoFromComment,
  getTagsFromComment,
  recurringTagFor,
} from './transaction-utils';
import { Grammar, Parser } from 'nearley';

/**
 * A RecurringTransaction is a scheduled template that produces real
 * transactions on a recurring basis. It is stored in the ledger file using
 * Ledger's periodic-transaction syntax (a `~` block) with the schedule state
 * held in a trailing metadata comment.
 *
 * Example serialized form:
 *
 *   ~ every 1 month on the 15    Rent    ; recur:a1b2c3 next:2026-07-15 workday:yes
 *       Expenses:Rent    $1500.00
 *       Assets:Checking
 */
export interface RecurringTransaction {
  /** A stable identifier used to reference this schedule and mark its instances. */
  id: string;

  /** The schedule repeats every `intervalCount` units. */
  intervalCount: number;
  unit: 'week' | 'month';

  /** Anchor weekday (0=Sunday .. 6=Saturday) when `unit` is 'week'. */
  weekday?: number;
  /** Anchor day of the month (1-31) when `unit` is 'month'. */
  dayOfMonth?: number;

  /** The nominal (unadjusted) date of the next occurrence, as YYYY-MM-DD. */
  nextDate: string;
  /** Optional inclusive end date (YYYY-MM-DD); occurrences after it are skipped. */
  endDate?: string;

  /**
   * When true, an occurrence that lands on a weekend or public holiday is moved
   * forward to the next working day (see the holiday country setting).
   */
  adjustToWorkday: boolean;

  payee: string;
  /** Transaction-level comment carrying the memo and tag(s), e.g. `rent #housing`. */
  comment?: string;
  expenselines: (EnhancedExpenseLine | Commentline)[];

  /**
   * block locates this recurring transaction's `~` block within the ledger file
   * so it can be edited or removed in place. It is absent for a transaction
   * being created in the form (which has not yet been written to the file).
   */
  block?: FileBlock;
}

const weekdayNames = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * makeRecurId returns a short, reasonably-unique identifier for a new recurring
 * transaction.
 */
export const makeRecurId = (): string =>
  Math.random().toString(36).slice(2, 8) +
  Math.random().toString(36).slice(2, 4);

// --- Period expression -----------------------------------------------------

/**
 * formatPeriodExpression renders the schedule of a recurring transaction as a
 * human-readable, Ledger-style period expression, e.g. `every 2 weeks on monday`
 * or `every 1 month on the 15`.
 */
export const formatPeriodExpression = (rt: RecurringTransaction): string => {
  if (rt.unit === 'week') {
    const unit = rt.intervalCount === 1 ? 'week' : 'weeks';
    return `every ${rt.intervalCount} ${unit} on ${
      weekdayNames[rt.weekday ?? 1]
    }`;
  }
  const unit = rt.intervalCount === 1 ? 'month' : 'months';
  return `every ${rt.intervalCount} ${unit} on the ${rt.dayOfMonth ?? 1}`;
};

interface ParsedPeriod {
  intervalCount: number;
  unit: 'week' | 'month';
  weekday?: number;
  dayOfMonth?: number;
}

/**
 * parsePeriodExpression parses a period expression produced by
 * formatPeriodExpression. Returns undefined if the expression is not
 * recognized.
 */
export const parsePeriodExpression = (
  expr: string,
): ParsedPeriod | undefined => {
  const match =
    /^every\s+(\d+)\s+(week|weeks|month|months)\s+on\s+(?:the\s+(\d+)|([a-z]+))$/i.exec(
      expr.trim(),
    );
  if (!match) {
    return undefined;
  }
  const intervalCount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase().startsWith('week') ? 'week' : 'month';
  if (unit === 'week') {
    const weekday = weekdayNames.indexOf((match[4] || '').toLowerCase());
    if (weekday === -1) {
      return undefined;
    }
    return { intervalCount, unit, weekday };
  }
  const dayOfMonth = parseInt(match[3], 10);
  if (Number.isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return undefined;
  }
  return { intervalCount, unit, dayOfMonth };
};

// --- Schedule math ---------------------------------------------------------

/**
 * firstOccurrenceOnOrAfter returns the first nominal occurrence date (YYYY-MM-DD)
 * of the schedule that is on or after the provided start date.
 */
export const firstOccurrenceOnOrAfter = (
  startISO: string,
  period: ParsedPeriod,
): string => {
  const m = window.moment(startISO, 'YYYY-MM-DD');
  if (period.unit === 'week') {
    const delta = ((period.weekday ?? 1) - m.day() + 7) % 7;
    return m.add(delta, 'days').format('YYYY-MM-DD');
  }
  const day = Math.min(period.dayOfMonth ?? 1, m.daysInMonth());
  if (m.date() <= day) {
    return m.date(day).format('YYYY-MM-DD');
  }
  m.add(1, 'month');
  return m
    .date(Math.min(period.dayOfMonth ?? 1, m.daysInMonth()))
    .format('YYYY-MM-DD');
};

/**
 * isOnAnchor returns true when the schedule's current nextDate falls on its
 * regular anchor (the configured weekday for a weekly schedule, or day of the
 * month for a monthly one). It is false when nextDate has been moved to a
 * one-off, off-schedule date — for example because the user edited it to a
 * specific next occurrence.
 */
export const isOnAnchor = (rt: RecurringTransaction): boolean => {
  const m = window.moment(rt.nextDate, 'YYYY-MM-DD');
  if (rt.unit === 'week') {
    return m.day() === (rt.weekday ?? 1);
  }
  return m.date() === Math.min(rt.dayOfMonth ?? m.date(), m.daysInMonth());
};

/**
 * nextNominalDate advances the schedule by one interval from its current
 * nextDate, returning the new nominal date (YYYY-MM-DD).
 *
 * When nextDate is on the schedule's regular anchor this simply steps forward
 * one interval. When nextDate has been moved to a one-off, off-schedule date
 * (e.g. the user set the next occurrence to a specific day), the schedule
 * resumes from the first regular occurrence strictly after that date, so the
 * override only affects the single occurrence and the rhythm is preserved.
 */
export const nextNominalDate = (rt: RecurringTransaction): string => {
  if (!isOnAnchor(rt)) {
    const dayAfter = window
      .moment(rt.nextDate, 'YYYY-MM-DD')
      .add(1, 'day')
      .format('YYYY-MM-DD');
    return firstOccurrenceOnOrAfter(dayAfter, {
      intervalCount: rt.intervalCount,
      unit: rt.unit,
      weekday: rt.weekday,
      dayOfMonth: rt.dayOfMonth,
    });
  }
  const m = window.moment(rt.nextDate, 'YYYY-MM-DD');
  if (rt.unit === 'week') {
    return m.add(rt.intervalCount, 'weeks').format('YYYY-MM-DD');
  }
  m.add(rt.intervalCount, 'months');
  const day = Math.min(rt.dayOfMonth ?? m.date(), m.daysInMonth());
  return m.date(day).format('YYYY-MM-DD');
};

/**
 * effectiveDueDate returns the date a recurring transaction is actually due
 * (YYYY-MM-DD). It is the nominal nextDate, optionally pushed forward onto the
 * next working day for the provided country.
 */
export const effectiveDueDate = (
  rt: RecurringTransaction,
  countryCode: string,
): string =>
  rt.adjustToWorkday ? nextWorkday(rt.nextDate, countryCode) : rt.nextDate;

/**
 * isDue returns true when the recurring transaction's next occurrence is due on
 * or before `todayISO` and has not passed its end date.
 */
export const isDue = (
  rt: RecurringTransaction,
  todayISO: string,
  countryCode: string,
): boolean => {
  if (rt.endDate && rt.nextDate > rt.endDate) {
    return false;
  }
  return effectiveDueDate(rt, countryCode) <= todayISO;
};

/**
 * advanceSchedule returns a copy of the recurring transaction advanced to its
 * next occurrence. Used both to skip an occurrence and after one is accepted.
 */
export const advanceSchedule = (
  rt: RecurringTransaction,
): RecurringTransaction => ({ ...rt, nextDate: nextNominalDate(rt) });

/**
 * materializeTransaction builds the concrete transaction for an occurrence of a
 * recurring transaction on the provided date (YYYY-MM-DD). The resulting
 * transaction carries a `#recurring-<id>` tag alongside the schedule's own tags
 * so it can be recognized and filtered in the transaction list.
 */
export const materializeTransaction = (
  rt: RecurringTransaction,
  dateISO: string,
): EnhancedTransaction => {
  const tags = getTagsFromComment(rt.comment);
  const memo = getMemoFromComment(rt.comment);
  const tag = recurringTagFor(rt.id);
  const allTags = tags.includes(tag) ? tags : [...tags, tag];
  return {
    type: 'tx',
    blockLine: -1,
    block: { firstLine: -1, lastLine: -1, block: '' },
    value: {
      // Store the date using the same slash format the form writes.
      date: dateISO.replace(/-/g, '/'),
      payee: rt.payee,
      comment: formatComment(memo, allTags),
      expenselines: rt.expenselines,
    },
  };
};

// Recognizing recurring instances is shared with the rest of the app via
// transaction-utils so it stays in the tag stream.
export { isRecurringInstance, recurringInstanceId } from './transaction-utils';

// --- Serialization ---------------------------------------------------------

const formatMetadata = (rt: RecurringTransaction): string => {
  const machine =
    `recur:${rt.id} next:${rt.nextDate} ` +
    `workday:${rt.adjustToWorkday ? 'yes' : 'no'}` +
    (rt.endDate ? ` end:${rt.endDate}` : '');
  return rt.comment ? `${rt.comment} ;; ${machine}` : machine;
};

/**
 * formatRecurringTransaction renders a single recurring transaction as its
 * Ledger periodic-transaction block.
 */
export const formatRecurringTransaction = (
  rt: RecurringTransaction,
  currencySymbol: string,
): string => {
  const header = `~ ${formatPeriodExpression(rt)}    ${
    rt.payee
  }    ; ${formatMetadata(rt)}`;
  const postings = formatExpenseLines(rt.expenselines, currencySymbol);
  return `${header}\n${postings}`;
};

// --- Parsing ---------------------------------------------------------------

/**
 * isRecurringBlock returns true when a block of text (as produced by the
 * parser's block splitter) is a recurring transaction, i.e. its first
 * non-empty line begins with `~`. This lets recurring transactions be placed
 * anywhere in the file, as in hledger.
 */
export const isRecurringBlock = (blockText: string): boolean => {
  for (const line of blockText.split('\n')) {
    if (line.trim() !== '') {
      return line.trimStart().startsWith('~');
    }
  }
  return false;
};

interface ParsedMetadata {
  id?: string;
  next?: string;
  workday: boolean;
  end?: string;
  comment?: string;
}

const parseMetadata = (raw: string): ParsedMetadata => {
  let comment: string | undefined;
  let machine = raw;
  const sep = raw.indexOf(';;');
  if (sep >= 0) {
    comment = raw.slice(0, sep).trim() || undefined;
    machine = raw.slice(sep + 2);
  }
  const id = /(?:^|\s)recur:(\S+)/.exec(machine)?.[1];
  const next = /(?:^|\s)next:(\S+)/.exec(machine)?.[1];
  const end = /(?:^|\s)end:(\S+)/.exec(machine)?.[1];
  const workday = /(?:^|\s)workday:yes/.test(machine);
  return { id, next, end, workday, comment };
};

/**
 * fillMissingPostingAmount fills the single posting that is missing an amount,
 * so the postings balance to zero. Mirrors how the parser handles regular
 * transactions, but is kept local to avoid a module dependency cycle.
 */
const fillMissingPostingAmount = (lines: Expenseline[]): void => {
  const accountLines = lines.filter((l) => 'account' in l);
  const missing = accountLines.filter((l) => l.amount === undefined);
  if (missing.length !== 1) {
    return;
  }
  const sum = accountLines.reduce(
    (acc, l) => (l.amount !== undefined ? acc + l.amount : acc),
    0,
  );
  const currency = accountLines.find((l) => l.currency)?.currency;
  missing[0].amount = -sum;
  if (currency && !missing[0].currency) {
    missing[0].currency = currency;
  }
};

/**
 * parsePostings parses the posting lines of a recurring block by reusing the
 * Ledger grammar with a synthetic transaction header, then dealiases the
 * accounts.
 */
const parsePostings = (
  postingLines: string[],
  aliases: Map<string, string>,
): (EnhancedExpenseLine | Commentline)[] => {
  const synthetic = `2000-01-01 recurring\n${postingLines.join('\n')}`;
  const parser = new Parser(Grammar.fromCompiled(grammar));
  const results = parser.feed(synthetic).finish();
  if (results.length !== 1) {
    throw new Error('Ambiguous recurring transaction postings');
  }
  const tx = results[0][0];
  const rawLines: Expenseline[] = tx.value.expenselines;
  fillMissingPostingAmount(rawLines);
  return rawLines.map((line): EnhancedExpenseLine | Commentline => {
    if (!('account' in line)) {
      return line;
    }
    return {
      account: line.account,
      dealiasedAccount: dealiasAccount(line.account, aliases),
      amount: line.amount || 0,
      currency: line.currency,
      comment: line.comment,
      reconcile: line.reconcile,
    };
  });
};

/**
 * parseRecurringBlock parses a single `~` block into a RecurringTransaction.
 */
const parseRecurringBlock = (
  blockLines: string[],
  aliases: Map<string, string>,
): RecurringTransaction => {
  const header = blockLines[0];
  const commentIdx = header.indexOf(';');
  let metaRaw = '';
  let headMain = header;
  if (commentIdx >= 0) {
    metaRaw = header.slice(commentIdx + 1).trim();
    headMain = header.slice(0, commentIdx);
  }
  headMain = headMain.trim().replace(/^~\s*/, '');
  const parts = headMain.split(/\s{2,}/);
  const periodExpr = parts[0].trim();
  const payee = parts.slice(1).join('  ').trim();

  const period = parsePeriodExpression(periodExpr);
  if (!period) {
    throw new Error(`Unrecognized recurring period: "${periodExpr}"`);
  }
  const meta = parseMetadata(metaRaw);
  if (!meta.next) {
    throw new Error('Recurring transaction is missing its next date');
  }

  const expenselines = parsePostings(blockLines.slice(1), aliases);

  return {
    id: meta.id || makeRecurId(),
    intervalCount: period.intervalCount,
    unit: period.unit,
    weekday: period.weekday,
    dayOfMonth: period.dayOfMonth,
    nextDate: meta.next,
    endDate: meta.end,
    adjustToWorkday: meta.workday,
    payee,
    comment: meta.comment,
    expenselines,
  };
};

/**
 * parseRecurringBlocks parses the recurring transactions from the provided
 * blocks (those for which isRecurringBlock returned true), attaching each
 * block's file location and collecting any parse errors.
 */
export const parseRecurringBlocks = (
  blocks: FileBlock[],
  aliases: Map<string, string>,
): { recurring: RecurringTransaction[]; errors: LedgerError[] } => {
  const recurring: RecurringTransaction[] = [];
  const errors: LedgerError[] = [];

  blocks.forEach((block) => {
    try {
      const rt = parseRecurringBlock(block.block.split('\n'), aliases);
      rt.block = block;
      recurring.push(rt);
    } catch (error) {
      errors.push({
        message: 'Failed to parse recurring transaction',
        error,
        block,
      });
    }
  });

  return { recurring, errors };
};

const isHeading = (line: string): boolean => line.trimStart().startsWith('#');

const isDatedTransaction = (line: string): boolean =>
  /^\d{4}[-/]\d{2}[-/]\d{2}/.test(line);

/**
 * lastRecurringBlockEnd returns the index of the last line belonging to the
 * final recurring (`~`) block in the file, or -1 when there are none. Blocks
 * are delimited by blank lines, matching the parser's block splitter.
 */
const lastRecurringBlockEnd = (lines: string[]): number => {
  let end = -1;
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].trim() !== '') {
      j++;
    }
    if (lines[i].trimStart().startsWith('~')) {
      end = j - 1;
    }
    i = j;
  }
  return end;
};

const spliceLines = (
  lines: string[],
  index: number,
  insert: string[],
): string =>
  [...lines.slice(0, index), ...insert, ...lines.slice(index)].join('\n');

/**
 * insertRecurringTransaction returns a copy of the file with the rendered
 * recurring transaction inserted above the regular transactions. Placement, in
 * order of preference:
 *
 *  1. After the last existing recurring transaction, keeping them together.
 *  2. Immediately before the heading that introduces the transactions (the `#`
 *     comment above the first transaction), if there is one.
 *  3. Immediately before the first transaction.
 *  4. At the end of the file when there are no transactions at all.
 *
 * No heading is added for the recurring transactions; they are just placed above
 * the regular ones. This works whether or not the file uses `#` section
 * headings.
 */
export const insertRecurringTransaction = (
  fileContents: string,
  rtText: string,
): string => {
  const lines = fileContents.split('\n');

  const lastEnd = lastRecurringBlockEnd(lines);
  if (lastEnd !== -1) {
    return spliceLines(lines, lastEnd + 1, ['', rtText]);
  }

  const firstTxIdx = lines.findIndex((line) => isDatedTransaction(line));
  if (firstTxIdx === -1) {
    // No transactions yet: append at the end of the file.
    const prefix = fileContents.trim() === '' ? [] : [''];
    return [...lines, ...prefix, rtText].join('\n');
  }

  // Insert before the heading that introduces the transactions, if present,
  // otherwise directly before the first transaction.
  let i = firstTxIdx - 1;
  while (i >= 0 && lines[i].trim() === '') {
    i--;
  }
  const insertAt = i >= 0 && isHeading(lines[i]) ? i : firstTxIdx;
  return spliceLines(lines, insertAt, [rtText, '']);
};
