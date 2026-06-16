import { EnhancedExpenseLine } from '../src/parser';
import {
  advanceSchedule,
  effectiveDueDate,
  extractRecurringSection,
  firstOccurrenceOnOrAfter,
  formatPeriodExpression,
  formatRecurringSection,
  isDue,
  isRecurringInstance,
  materializeTransaction,
  nextNominalDate,
  parsePeriodExpression,
  parseRecurringSection,
  RecurringTransaction,
  spliceRecurringSection,
} from '../src/recurring';
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
  test('round-trips a monthly expression', () => {
    expect(formatPeriodExpression(monthlyRent)).toBe('every 1 month on the 15');
    expect(parsePeriodExpression('every 1 month on the 15')).toEqual({
      intervalCount: 1,
      unit: 'month',
      dayOfMonth: 15,
    });
  });

  test('round-trips a weekly expression', () => {
    const weekly: RecurringTransaction = {
      ...monthlyRent,
      unit: 'week',
      intervalCount: 2,
      weekday: 1,
      dayOfMonth: undefined,
    };
    expect(formatPeriodExpression(weekly)).toBe('every 2 weeks on monday');
    expect(parsePeriodExpression('every 2 weeks on monday')).toEqual({
      intervalCount: 2,
      unit: 'week',
      weekday: 1,
    });
  });

  test('returns undefined for unrecognized expressions', () => {
    expect(parsePeriodExpression('sometimes')).toBeUndefined();
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
    const tx = materializeTransaction(
      { ...monthlyRent, nextDate: '2026-07-04' },
      '',
    );
    expect(tx.value.payee).toBe('Rent');
    expect(tx.value.date).toBe('2026/07/06'); // adjusted to Monday, slashes
    expect(tx.value.comment).toBe('monthly rent #housing');
    expect(isRecurringInstance(tx)).toBe(true);
  });
});

describe('serialization round-trip', () => {
  test('formats and re-parses a recurring transaction', () => {
    const section = formatRecurringSection([monthlyRent], '$');
    const { hasSection, recurringText } = extractRecurringSection(section);
    expect(hasSection).toBe(true);

    const { recurring, errors } = parseRecurringSection(
      recurringText,
      new Map(),
    );
    expect(errors).toEqual([]);
    expect(recurring).toHaveLength(1);

    const rt = recurring[0];
    expect(rt.id).toBe('abc123');
    expect(rt.payee).toBe('Rent');
    expect(rt.comment).toBe('monthly rent #housing');
    expect(rt.unit).toBe('month');
    expect(rt.dayOfMonth).toBe(15);
    expect(rt.nextDate).toBe('2026-07-15');
    expect(rt.adjustToWorkday).toBe(true);

    const amounts = rt.expenselines
      .filter((l): l is EnhancedExpenseLine => 'account' in l)
      .map((l) => l.amount);
    expect(amounts).toEqual([1500, -1500]);
  });

  test('parses a recurring transaction without a user comment', () => {
    const rt = { ...monthlyRent, comment: undefined };
    const section = formatRecurringSection([rt], '$');
    const { recurringText } = extractRecurringSection(section);
    const { recurring } = parseRecurringSection(recurringText, new Map());
    expect(recurring[0].comment).toBeUndefined();
    expect(recurring[0].payee).toBe('Rent');
  });
});

describe('extract and splice', () => {
  test('blanks out the recurring region while preserving line numbers', () => {
    const file = [
      'alias e=Expenses',
      '',
      formatRecurringSection([monthlyRent], '$'),
      '',
      '2026/06/01 Groceries',
      '  Expenses:Food    $20.00',
      '  Assets:Checking',
    ].join('\n');

    const { blankedContents } = extractRecurringSection(file);
    const blankedLines = blankedContents.split('\n');
    const originalLines = file.split('\n');
    // The transaction lines keep their original positions.
    const txLineIndex = originalLines.indexOf('2026/06/01 Groceries');
    expect(blankedLines[txLineIndex]).toBe('2026/06/01 Groceries');
    // The line count is unchanged.
    expect(blankedLines.length).toBe(originalLines.length);
  });

  test('inserts a new region before the first transaction', () => {
    const file = ['alias e=Expenses', '', '2026/06/01 Groceries', '  x'].join(
      '\n',
    );
    const section = formatRecurringSection([monthlyRent], '$');
    const result = spliceRecurringSection(file, section);
    const lines = result.split('\n');
    const recurIndex = lines.findIndex((l) => l.startsWith('~'));
    const txIndex = lines.findIndex((l) => l.startsWith('2026/06/01'));
    expect(recurIndex).toBeGreaterThan(-1);
    expect(recurIndex).toBeLessThan(txIndex);
  });

  test('replaces an existing region and can remove it', () => {
    const file = ['alias e=Expenses', '', '2026/06/01 Groceries', '  x'].join(
      '\n',
    );
    const withSection = spliceRecurringSection(
      file,
      formatRecurringSection([monthlyRent], '$'),
    );
    const removed = spliceRecurringSection(withSection, '');
    expect(removed).not.toContain('~ every');
    expect(removed).toContain('2026/06/01 Groceries');
  });
});
