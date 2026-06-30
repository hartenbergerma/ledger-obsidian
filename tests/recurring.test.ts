import { EnhancedExpenseLine, parse } from '../src/parser';
import {
  advanceSchedule,
  effectiveDueDate,
  firstOccurrenceOnOrAfter,
  formatPeriodExpression,
  formatRecurringTransaction,
  insertRecurringTransaction,
  isDue,
  isRecurringBlock,
  isRecurringInstance,
  materializeTransaction,
  nextNominalDate,
  RecurringTransaction,
  schedulePatternChanged,
} from '../src/recurring';
import { settingsWithDefaults } from '../src/settings';
import * as moment from 'moment';

window.moment = moment;

const line = (
  account: string,
  amount: number,
  currency?: string,
): EnhancedExpenseLine => ({
  account,
  dealiasedAccount: account,
  amount,
  currency,
  reconcile: '',
});

const monthlyRent: RecurringTransaction = {
  id: 'abc123',
  intervalCount: 1,
  unit: 'month',
  dayOfMonth: 15,
  nextDate: '2026-07-15',
  adjustToWorkday: true,
  payee: 'Rent',
  comment: 'monthly rent #housing',
  expenselines: [
    line('Expenses:Rent', 1500, '$'),
    line('Assets:Checking', -1500, '$'),
  ],
};

describe('period expressions', () => {
  test('formats monthly schedules as hledger period expressions', () => {
    expect(formatPeriodExpression(monthlyRent)).toBe('every 15th day of month');
    expect(formatPeriodExpression({ ...monthlyRent, dayOfMonth: 1 })).toBe(
      'every 1st day of month',
    );
    expect(formatPeriodExpression({ ...monthlyRent, intervalCount: 2 })).toBe(
      'every 2 months',
    );
  });

  test('formats weekly schedules as hledger period expressions', () => {
    const weekly: RecurringTransaction = {
      ...monthlyRent,
      unit: 'week',
      weekday: 1,
      dayOfMonth: undefined,
    };
    expect(formatPeriodExpression({ ...weekly, intervalCount: 1 })).toBe(
      'every monday',
    );
    expect(formatPeriodExpression({ ...weekly, intervalCount: 2 })).toBe(
      'every 2 weeks',
    );
  });
});

describe('schedule math', () => {
  test('firstOccurrenceOnOrAfter for monthly', () => {
    const period = { intervalCount: 1, unit: 'month' as const, dayOfMonth: 15 };
    expect(firstOccurrenceOnOrAfter('2026-06-10', period)).toBe('2026-06-15');
    expect(firstOccurrenceOnOrAfter('2026-06-16', period)).toBe('2026-07-15');
  });

  test('firstOccurrenceOnOrAfter for weekly', () => {
    const period = { intervalCount: 2, unit: 'week' as const, weekday: 1 };
    // 2026-06-16 is a Tuesday; the next Monday is 2026-06-22.
    expect(firstOccurrenceOnOrAfter('2026-06-16', period)).toBe('2026-06-22');
  });

  test('nextNominalDate advances months and clamps the day', () => {
    const jan31: RecurringTransaction = {
      ...monthlyRent,
      dayOfMonth: 31,
      nextDate: '2026-01-31',
    };
    expect(nextNominalDate(jan31)).toBe('2026-02-28');
    // Advancing again should recover the 31st, not drift to the 28th.
    expect(nextNominalDate({ ...jan31, nextDate: '2026-02-28' })).toBe(
      '2026-03-31',
    );
  });

  test('nextNominalDate advances by whole weeks', () => {
    const weekly: RecurringTransaction = {
      ...monthlyRent,
      unit: 'week',
      intervalCount: 2,
      weekday: 1,
      dayOfMonth: undefined,
      nextDate: '2026-06-22',
    };
    expect(nextNominalDate(weekly)).toBe('2026-07-06');
  });

  test('nextNominalDate resumes on the weekly anchor after an off-schedule date', () => {
    // "Every week on Thursday" whose next date was moved to a Monday: the
    // following occurrence returns to Thursday rather than staying on Monday.
    const weekly: RecurringTransaction = {
      ...monthlyRent,
      unit: 'week',
      intervalCount: 1,
      weekday: 4, // Thursday
      dayOfMonth: undefined,
      nextDate: '2026-06-22', // a Monday
    };
    expect(nextNominalDate(weekly)).toBe('2026-06-25');
  });

  test('nextNominalDate resumes on the monthly anchor after an off-schedule date', () => {
    // Monthly on the 15th whose next date was moved earlier, to the 3rd: the
    // following occurrence returns to the 15th of the same month.
    const monthly: RecurringTransaction = {
      ...monthlyRent,
      nextDate: '2026-07-03',
    };
    expect(nextNominalDate(monthly)).toBe('2026-07-15');
  });

  test('schedulePatternChanged detects pattern-affecting edits', () => {
    // Same pattern, only the next date differs: not a pattern change.
    expect(
      schedulePatternChanged(monthlyRent, {
        intervalCount: 1,
        unit: 'month',
        dayOfMonth: 15,
      }),
    ).toBe(false);
    // Moving the day of the month is a pattern change.
    expect(
      schedulePatternChanged(monthlyRent, {
        intervalCount: 1,
        unit: 'month',
        dayOfMonth: 20,
      }),
    ).toBe(true);
    // Changing the interval is a pattern change.
    expect(
      schedulePatternChanged(monthlyRent, {
        intervalCount: 2,
        unit: 'month',
        dayOfMonth: 15,
      }),
    ).toBe(true);
    // Switching units is a pattern change; the weekday anchor is then compared.
    expect(
      schedulePatternChanged(monthlyRent, {
        intervalCount: 1,
        unit: 'week',
        weekday: 1,
      }),
    ).toBe(true);
    const weekly: RecurringTransaction = {
      ...monthlyRent,
      unit: 'week',
      weekday: 1,
      dayOfMonth: undefined,
    };
    expect(
      schedulePatternChanged(weekly, {
        intervalCount: 1,
        unit: 'week',
        weekday: 1,
      }),
    ).toBe(false);
    expect(
      schedulePatternChanged(weekly, {
        intervalCount: 1,
        unit: 'week',
        weekday: 4,
      }),
    ).toBe(true);
  });

  test('editing a monthly schedule recomputes the next date onto the new anchor', () => {
    // Mirrors how the edit form recomputes the next date when the schedule (but
    // not the date field) is changed: the next occurrence snaps to the new
    // day-of-month on or after the previous next date.
    expect(
      firstOccurrenceOnOrAfter(monthlyRent.nextDate, {
        intervalCount: 1,
        unit: 'month',
        dayOfMonth: 20,
      }),
    ).toBe('2026-07-20');
    // Moving to an earlier day-of-month rolls to the following month.
    expect(
      firstOccurrenceOnOrAfter(monthlyRent.nextDate, {
        intervalCount: 1,
        unit: 'month',
        dayOfMonth: 10,
      }),
    ).toBe('2026-08-10');
  });

  test('advanceSchedule returns a copy with the next date', () => {
    const advanced = advanceSchedule(monthlyRent);
    expect(advanced.nextDate).toBe('2026-08-15');
    expect(monthlyRent.nextDate).toBe('2026-07-15'); // unchanged
  });
});

describe('due dates', () => {
  test('effectiveDueDate moves onto the next working day when enabled', () => {
    // 2026-07-04 is a Saturday; with adjustment the due date is Monday.
    const rt = { ...monthlyRent, nextDate: '2026-07-04' };
    expect(effectiveDueDate(rt, '')).toBe('2026-07-06');
    expect(effectiveDueDate({ ...rt, adjustToWorkday: false }, '')).toBe(
      '2026-07-04',
    );
  });

  test('isDue compares the effective date against today', () => {
    expect(
      isDue({ ...monthlyRent, nextDate: '2026-06-01' }, '2026-06-16', ''),
    ).toBe(true);
    expect(
      isDue({ ...monthlyRent, nextDate: '2026-12-01' }, '2026-06-16', ''),
    ).toBe(false);
  });

  test('isDue respects the end date', () => {
    const rt = {
      ...monthlyRent,
      nextDate: '2026-06-01',
      endDate: '2026-05-01',
    };
    expect(isDue(rt, '2026-06-16', '')).toBe(false);
  });
});

describe('materializeTransaction', () => {
  test('creates a transaction marked as a recurring instance', () => {
    const rt = { ...monthlyRent, nextDate: '2026-07-04' };
    // The caller passes the date; here the working-day-adjusted due date.
    const tx = materializeTransaction(rt, effectiveDueDate(rt, ''));
    expect(tx.value.payee).toBe('Rent');
    expect(tx.value.date).toBe('2026-07-06'); // adjusted to Monday
    // The recurring marker is stored as a tag alongside the user's tags.
    expect(tx.value.comment).toBe('monthly rent #housing #recurring-abc123');
    expect(isRecurringInstance(tx)).toBe(true);
  });

  test('uses the provided date verbatim', () => {
    expect(materializeTransaction(monthlyRent, '2026-09-15').value.date).toBe(
      '2026-09-15',
    );
  });
});

describe('isRecurringBlock', () => {
  test('detects blocks that begin with ~', () => {
    expect(isRecurringBlock(formatRecurringTransaction(monthlyRent, '$'))).toBe(
      true,
    );
    expect(
      isRecurringBlock('2025/08/22 Edeka\n  Expenses:Food    $2.79\n  Assets'),
    ).toBe(false);
  });
});

describe('parsing recurring transactions from a file', () => {
  const settings = settingsWithDefaults({});

  test('parses a recurring transaction and round-trips its fields', () => {
    const file = [
      '# recurring transactions',
      '',
      formatRecurringTransaction(monthlyRent, '$'),
      '',
      '2026/06/01 Groceries',
      '  Expenses:Food    $20.00',
      '  Assets:Checking',
    ].join('\n');

    const cache = parse(file, settings);
    expect(cache.parsingErrors).toEqual([]);
    expect(cache.recurringTransactions).toHaveLength(1);
    expect(cache.transactions).toHaveLength(1);
    expect(cache.transactions[0].value.payee).toBe('Groceries');

    const rt = cache.recurringTransactions[0];
    expect(rt.id).toBe('abc123');
    expect(rt.payee).toBe('Rent');
    expect(rt.comment).toBe('monthly rent #housing');
    expect(rt.unit).toBe('month');
    expect(rt.dayOfMonth).toBe(15);
    expect(rt.nextDate).toBe('2026-07-15');
    expect(rt.adjustToWorkday).toBe(true);
    expect(rt.block).toBeDefined();

    const amounts = rt.expenselines
      .filter((l): l is EnhancedExpenseLine => 'account' in l)
      .map((l) => l.amount);
    expect(amounts).toEqual([1500, -1500]);
  });

  test('parses recurring transactions placed anywhere in the file', () => {
    // The recurring transaction appears after the regular ones, with no
    // managed section, as hledger allows.
    const file = [
      '2026/06/01 Groceries',
      '  Expenses:Food    $20.00',
      '  Assets:Checking',
      '',
      formatRecurringTransaction(monthlyRent, '$'),
    ].join('\n');

    const cache = parse(file, settings);
    expect(cache.parsingErrors).toEqual([]);
    expect(cache.transactions).toHaveLength(1);
    expect(cache.recurringTransactions).toHaveLength(1);
  });

  test('parses a recurring transaction without a user comment', () => {
    const rt = { ...monthlyRent, comment: undefined };
    const file = formatRecurringTransaction(rt, '$');
    const cache = parse(file, settings);
    expect(cache.recurringTransactions[0].comment).toBeUndefined();
    expect(cache.recurringTransactions[0].payee).toBe('Rent');
  });

  test('emits a valid hledger period expression and round-trips via metadata', () => {
    // "every 2 weeks on thursday" has no single hledger period expression, so
    // the period expression only carries the interval while the weekday survives
    // in the metadata comment and is recovered on parse.
    const weekly: RecurringTransaction = {
      ...monthlyRent,
      unit: 'week',
      intervalCount: 2,
      weekday: 4,
      dayOfMonth: undefined,
      nextDate: '2026-07-02',
    };
    const file = formatRecurringTransaction(weekly, '$');
    expect(file).toContain('~ every 2 weeks ');

    const cache = parse(file, settings);
    expect(cache.parsingErrors).toEqual([]);
    const rt = cache.recurringTransactions[0];
    expect(rt.unit).toBe('week');
    expect(rt.intervalCount).toBe(2);
    expect(rt.weekday).toBe(4);
    expect(rt.nextDate).toBe('2026-07-02');
  });
});

describe('insertRecurringTransaction', () => {
  const settings = settingsWithDefaults({});
  const rtText = formatRecurringTransaction(monthlyRent, '$');

  test('places the recurring transaction above the transactions heading', () => {
    const file = [
      '# Transaktionen',
      '2025/08/22 Edeka',
      '  Expenses:Food    $2.79',
      '  Assets:Checking',
    ].join('\n');

    const result = insertRecurringTransaction(file, rtText);
    const lines = result.split('\n');
    // No heading is added; the ~ block sits above the transactions heading.
    expect(lines).not.toContain('# recurring transactions');
    const recurIdx = lines.findIndex((l) => l.startsWith('~'));
    const txHeading = lines.indexOf('# Transaktionen');
    expect(recurIdx).toBeGreaterThan(-1);
    expect(recurIdx).toBeLessThan(txHeading);

    // The result still parses cleanly with both kinds of transaction.
    const cache = parse(result, settings);
    expect(cache.parsingErrors).toEqual([]);
    expect(cache.recurringTransactions).toHaveLength(1);
    expect(cache.transactions).toHaveLength(1);
  });

  test('inserts before the first transaction when there is no heading', () => {
    const file = [
      '2025/08/22 Edeka',
      '  Expenses:Food    $2.79',
      '  Assets:Checking',
    ].join('\n');

    const result = insertRecurringTransaction(file, rtText);
    const lines = result.split('\n');
    const recurIdx = lines.findIndex((l) => l.startsWith('~'));
    const txIdx = lines.findIndex((l) => l.startsWith('2025/08/22'));
    expect(lines).not.toContain('# recurring transactions');
    expect(recurIdx).toBeGreaterThan(-1);
    expect(recurIdx).toBeLessThan(txIdx);
  });

  test('appends after an existing recurring transaction', () => {
    const file = [
      '# recurring transactions',
      '',
      formatRecurringTransaction({ ...monthlyRent, id: 'first' }, '$'),
      '',
      '2025/08/22 Edeka',
      '  Expenses:Food    $2.79',
      '  Assets:Checking',
    ].join('\n');

    const result = insertRecurringTransaction(
      file,
      formatRecurringTransaction({ ...monthlyRent, id: 'second' }, '$'),
    );
    expect((result.match(/^~ /gm) || []).length).toBe(2);

    const cache = parse(result, settings);
    expect(cache.parsingErrors).toEqual([]);
    expect(cache.recurringTransactions).toHaveLength(2);
    expect(cache.transactions).toHaveLength(1);
  });

  test('appends to an empty file', () => {
    const result = insertRecurringTransaction('', rtText);
    const cache = parse(result, settings);
    expect(cache.recurringTransactions).toHaveLength(1);
  });
});
