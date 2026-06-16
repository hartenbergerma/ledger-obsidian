import {
  computeEaster,
  isHoliday,
  isWeekend,
  isWorkday,
  nextWorkday,
} from '../src/holidays';

describe('computeEaster', () => {
  test('computes known Easter Sunday dates', () => {
    expect(computeEaster(2024)).toEqual({ month: 3, day: 31 });
    expect(computeEaster(2025)).toEqual({ month: 4, day: 20 });
    expect(computeEaster(2026)).toEqual({ month: 4, day: 5 });
  });
});

describe('isWeekend', () => {
  test('detects Saturday and Sunday', () => {
    expect(isWeekend('2026-06-13')).toBe(true); // Saturday
    expect(isWeekend('2026-06-14')).toBe(true); // Sunday
    expect(isWeekend('2026-06-15')).toBe(false); // Monday
  });
});

describe('isHoliday', () => {
  test('recognizes fixed-date national holidays', () => {
    expect(isHoliday('2026-07-04', 'US')).toBe(true); // Independence Day
    expect(isHoliday('2026-10-03', 'DE')).toBe(true); // German Unity Day
    expect(isHoliday('2026-07-04', 'DE')).toBe(false);
  });

  test('recognizes Easter-derived holidays', () => {
    // Good Friday 2026 is April 3 (Easter Sunday April 5 minus 2 days).
    expect(isHoliday('2026-04-03', 'DE')).toBe(true);
  });

  test('recognizes nth-weekday holidays', () => {
    // US Thanksgiving 2026 is the 4th Thursday of November = Nov 26.
    expect(isHoliday('2026-11-26', 'US')).toBe(true);
  });

  test('has no holidays for an empty country', () => {
    expect(isHoliday('2026-01-01', '')).toBe(false);
  });
});

describe('nextWorkday', () => {
  test('returns the same date when it is already a working day', () => {
    expect(nextWorkday('2026-06-15', '')).toBe('2026-06-15'); // Monday
  });

  test('skips weekends', () => {
    expect(nextWorkday('2026-06-13', '')).toBe('2026-06-15'); // Sat -> Mon
  });

  test('skips public holidays', () => {
    // Jan 1 2026 (Thursday) is a US holiday; Jan 2 is a working day.
    expect(nextWorkday('2026-01-01', 'US')).toBe('2026-01-02');
  });

  test('skips a holiday that lands next to a weekend', () => {
    // Dec 25 2026 is a Friday holiday (US); Dec 26-27 is the weekend.
    expect(nextWorkday('2026-12-25', 'US')).toBe('2026-12-28');
  });
});

describe('isWorkday', () => {
  test('combines weekend and holiday checks', () => {
    expect(isWorkday('2026-06-15', 'US')).toBe(true);
    expect(isWorkday('2026-06-13', 'US')).toBe(false); // weekend
    expect(isWorkday('2026-07-03', 'US')).toBe(true); // not a holiday
  });
});
