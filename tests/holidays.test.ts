import {
  isHoliday,
  isWeekend,
  isWorkday,
  nextWorkday,
  supportedCountries,
} from '../src/holidays';

describe('supportedCountries', () => {
  test('offers a weekends-only option followed by named countries', () => {
    expect(supportedCountries[0]).toEqual({
      code: '',
      name: 'None (weekends only)',
    });
    expect(supportedCountries.length).toBeGreaterThan(50);
    expect(supportedCountries.some((c) => c.code === 'US')).toBe(true);
    expect(supportedCountries.some((c) => c.code === 'DE')).toBe(true);
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
    expect(isHoliday('2026-12-25', 'US')).toBe(true); // Christmas Day (Friday)
    expect(isHoliday('2026-10-03', 'DE')).toBe(true); // German Unity Day
    expect(isHoliday('2026-12-25', 'DE')).toBe(true);
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

  test('ignores non-public days such as observances', () => {
    // Valentine's Day is an observance, not a public holiday.
    expect(isHoliday('2026-02-14', 'US')).toBe(false);
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
    expect(isWorkday('2026-07-07', 'US')).toBe(true); // ordinary Tuesday
  });
});
