import grammar from '../grammar/ledger';
import { Error as LedgerError } from './error';
import { nextWorkday } from './holidays';
import type {
  Commentline,
  EnhancedExpenseLine,
  EnhancedTransaction,
  Expenseline,
} from './parser';
import { dealiasAccount, formatExpenseLines } from './transaction-utils';
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
}

const RECUR_BEGIN =
  '; >>> ledger-obsidian recurring transactions (managed) >>>';
const RECUR_END = '; <<< ledger-obsidian recurring transactions <<<';

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
 * nextNominalDate advances the schedule by one interval from its current
 * nextDate, returning the new nominal date (YYYY-MM-DD).
 */
export const nextNominalDate = (rt: RecurringTransaction): string => {
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
 * materializeTransaction builds the concrete transaction for the current due
 * occurrence of a recurring transaction. The resulting transaction carries a
 * `recur:<id>` marker comment line so it can be recognized in the transaction
 * list.
 */
export const materializeTransaction = (
  rt: RecurringTransaction,
  countryCode: string,
): EnhancedTransaction => {
  const dueDate = effectiveDueDate(rt, countryCode);
  const marker: Commentline = { comment: `recur:${rt.id}` };
  return {
    type: 'tx',
    blockLine: -1,
    block: { firstLine: -1, lastLine: -1, block: '' },
    value: {
      // Store the date using the same slash format the form writes.
      date: dueDate.replace(/-/g, '/'),
      payee: rt.payee,
      comment: rt.comment,
      expenselines: [marker, ...rt.expenselines],
    },
  };
};

/**
 * isRecurringInstance returns true when the transaction was generated from a
 * recurring schedule (it contains a `recur:<id>` marker comment line).
 */
export const isRecurringInstance = (tx: EnhancedTransaction): boolean =>
  recurringInstanceId(tx) !== undefined;

/**
 * recurringInstanceId returns the recurring schedule id a transaction was
 * generated from, or undefined when it is not a recurring instance.
 */
export const recurringInstanceId = (
  tx: EnhancedTransaction,
): string | undefined => {
  for (const line of tx.value.expenselines) {
    if (!('account' in line) && line.comment) {
      const match = /^recur:(\S+)/.exec(line.comment.trim());
      if (match) {
        return match[1];
      }
    }
  }
  return undefined;
};

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

/**
 * formatRecurringSection renders the full managed recurring-transactions region
 * (including its begin/end markers) for the provided schedules. Returns an empty
 * string when there are no recurring transactions, so the region is removed.
 */
export const formatRecurringSection = (
  rts: RecurringTransaction[],
  currencySymbol: string,
): string => {
  if (rts.length === 0) {
    return '';
  }
  const blocks = rts
    .map((rt) => formatRecurringTransaction(rt, currencySymbol))
    .join('\n\n');
  return `${RECUR_BEGIN}\n${blocks}\n${RECUR_END}`;
};

// --- Parsing ---------------------------------------------------------------

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
 * extractRecurringSection locates the managed recurring region within a ledger
 * file. It returns the raw text of the region (excluding markers) along with a
 * copy of the file in which the region's lines have been blanked out. Blanking
 * (rather than removing) preserves the line numbers of the remaining
 * transactions so they can still be edited in place.
 */
export const extractRecurringSection = (
  fileContents: string,
): { hasSection: boolean; recurringText: string; blankedContents: string } => {
  const lines = fileContents.split('\n');
  let begin = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (begin === -1 && trimmed === RECUR_BEGIN) {
      begin = i;
    } else if (begin !== -1 && trimmed === RECUR_END) {
      end = i;
      break;
    }
  }

  if (begin === -1 || end === -1) {
    return {
      hasSection: false,
      recurringText: '',
      blankedContents: fileContents,
    };
  }

  const recurringText = lines.slice(begin + 1, end).join('\n');
  const blankedContents = lines
    .map((line, i) => (i >= begin && i <= end ? '' : line))
    .join('\n');
  return { hasSection: true, recurringText, blankedContents };
};

/**
 * parseRecurringSection parses the recurring region text into a list of
 * recurring transactions, collecting any parse errors.
 */
export const parseRecurringSection = (
  recurringText: string,
  aliases: Map<string, string>,
): { recurring: RecurringTransaction[]; errors: LedgerError[] } => {
  const recurring: RecurringTransaction[] = [];
  const errors: LedgerError[] = [];

  // Group lines into blocks, each starting with a `~` line.
  const blocks: string[][] = [];
  recurringText.split('\n').forEach((line) => {
    if (line.trim() === '') {
      return;
    }
    if (line.trimStart().startsWith('~')) {
      blocks.push([line]);
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].push(line);
    }
  });

  blocks.forEach((blockLines) => {
    try {
      recurring.push(parseRecurringBlock(blockLines, aliases));
    } catch (error) {
      errors.push({
        message: 'Failed to parse recurring transaction',
        error,
        block: {
          block: blockLines.join('\n'),
          firstLine: -1,
          lastLine: -1,
        },
      });
    }
  });

  return { recurring, errors };
};

/**
 * spliceRecurringSection returns a copy of the file contents with the managed
 * recurring region replaced by `sectionText` (which should already include its
 * markers, or be empty to remove the region). When the file has no region yet,
 * the section is inserted before the first dated transaction, keeping it above
 * the transactions.
 */
export const spliceRecurringSection = (
  fileContents: string,
  sectionText: string,
): string => {
  const lines = fileContents.split('\n');
  let begin = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (begin === -1 && trimmed === RECUR_BEGIN) {
      begin = i;
    } else if (begin !== -1 && trimmed === RECUR_END) {
      end = i;
      break;
    }
  }

  if (begin !== -1 && end !== -1) {
    // Replace the existing region. When the new section is empty, also drop a
    // trailing blank line to avoid accumulating blank lines.
    let removeEnd = end;
    if (sectionText === '' && lines[end + 1] === '') {
      removeEnd = end + 1;
    }
    const before = lines.slice(0, begin);
    const after = lines.slice(removeEnd + 1);
    const middle = sectionText === '' ? [] : sectionText.split('\n');
    return [...before, ...middle, ...after].join('\n');
  }

  if (sectionText === '') {
    return fileContents;
  }

  // No region yet: insert before the first dated transaction.
  const firstTxIndex = lines.findIndex((line) =>
    /^\d{4}[-/]\d{2}[-/]\d{2}/.test(line),
  );
  const insertAt = firstTxIndex === -1 ? lines.length : firstTxIndex;
  const block = [...sectionText.split('\n'), ''];
  return [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)].join(
    '\n',
  );
};
