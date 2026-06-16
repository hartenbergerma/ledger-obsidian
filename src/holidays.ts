/**
 * holidays.ts provides a small, dependency-free public-holiday calendar used to
 * adjust the evaluation date of recurring transactions onto a working day.
 *
 * It is intentionally self-contained (rather than pulling in a large holiday
 * library) so the plugin stays lightweight on mobile. Coverage is national
 * public holidays for a curated set of countries; regional/observance-only days
 * are not included. Saturdays and Sundays are always treated as non-working
 * days regardless of the selected country.
 */

export interface Country {
  code: string;
  name: string;
}

/**
 * supportedCountries is the list offered in the settings dropdown. The empty
 * code represents "weekends only" (no public-holiday calendar).
 */
export const supportedCountries: Country[] = [
  { code: '', name: 'None (weekends only)' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
];

type Rule =
  | { type: 'fixed'; month: number; day: number } // month is 1-12
  | { type: 'easter'; offset: number } // days relative to Easter Sunday
  | {
      // The nth weekday of a month, e.g. the 4th Thursday of November.
      type: 'nthWeekday';
      month: number; // 1-12
      weekday: number; // 0 (Sun) - 6 (Sat)
      n: number; // 1-5, or -1 for the last occurrence
    };

const easterRules = (offsets: number[]): Rule[] =>
  offsets.map((offset) => ({ type: 'easter', offset }));

// Common building blocks reused across countries.
const newYear: Rule = { type: 'fixed', month: 1, day: 1 };
const christmas: Rule = { type: 'fixed', month: 12, day: 25 };

const countryRules: Record<string, Rule[]> = {
  US: [
    newYear,
    { type: 'nthWeekday', month: 1, weekday: 1, n: 3 }, // MLK Day
    { type: 'nthWeekday', month: 2, weekday: 1, n: 3 }, // Presidents' Day
    { type: 'nthWeekday', month: 5, weekday: 1, n: -1 }, // Memorial Day
    { type: 'fixed', month: 6, day: 19 }, // Juneteenth
    { type: 'fixed', month: 7, day: 4 }, // Independence Day
    { type: 'nthWeekday', month: 9, weekday: 1, n: 1 }, // Labor Day
    { type: 'nthWeekday', month: 11, weekday: 4, n: 4 }, // Thanksgiving
    christmas,
  ],
  CA: [
    newYear,
    ...easterRules([-2]), // Good Friday
    { type: 'nthWeekday', month: 5, weekday: 1, n: -1 }, // Victoria Day (approx: last Mon)
    { type: 'fixed', month: 7, day: 1 }, // Canada Day
    { type: 'nthWeekday', month: 9, weekday: 1, n: 1 }, // Labour Day
    { type: 'nthWeekday', month: 10, weekday: 1, n: 2 }, // Thanksgiving
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 }, // Boxing Day
  ],
  GB: [
    newYear,
    ...easterRules([-2, 1]), // Good Friday, Easter Monday
    { type: 'nthWeekday', month: 5, weekday: 1, n: 1 }, // Early May bank holiday
    { type: 'nthWeekday', month: 5, weekday: 1, n: -1 }, // Spring bank holiday
    { type: 'nthWeekday', month: 8, weekday: 1, n: -1 }, // Summer bank holiday
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  IE: [
    newYear,
    { type: 'fixed', month: 2, day: 1 }, // St Brigid's Day
    { type: 'fixed', month: 3, day: 17 }, // St Patrick's Day
    ...easterRules([1]), // Easter Monday
    { type: 'nthWeekday', month: 5, weekday: 1, n: 1 },
    { type: 'nthWeekday', month: 6, weekday: 1, n: 1 },
    { type: 'nthWeekday', month: 8, weekday: 1, n: 1 },
    { type: 'nthWeekday', month: 10, weekday: 1, n: -1 },
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  DE: [
    newYear,
    ...easterRules([-2, 1, 39, 50]), // Good Friday, Easter Mon, Ascension, Whit Mon
    { type: 'fixed', month: 5, day: 1 }, // Labour Day
    { type: 'fixed', month: 10, day: 3 }, // German Unity Day
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  AT: [
    newYear,
    { type: 'fixed', month: 1, day: 6 }, // Epiphany
    ...easterRules([1, 39, 50, 60]), // Easter Mon, Ascension, Whit Mon, Corpus Christi
    { type: 'fixed', month: 5, day: 1 },
    { type: 'fixed', month: 8, day: 15 }, // Assumption
    { type: 'fixed', month: 10, day: 26 }, // National Day
    { type: 'fixed', month: 11, day: 1 }, // All Saints'
    { type: 'fixed', month: 12, day: 8 }, // Immaculate Conception
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  CH: [
    newYear,
    ...easterRules([-2, 1, 39, 50]),
    { type: 'fixed', month: 8, day: 1 }, // Swiss National Day
    { type: 'fixed', month: 12, day: 25 },
  ],
  FR: [
    newYear,
    ...easterRules([1, 39, 50]), // Easter Mon, Ascension, Whit Mon
    { type: 'fixed', month: 5, day: 1 },
    { type: 'fixed', month: 5, day: 8 }, // Victory in Europe Day
    { type: 'fixed', month: 7, day: 14 }, // Bastille Day
    { type: 'fixed', month: 8, day: 15 },
    { type: 'fixed', month: 11, day: 1 },
    { type: 'fixed', month: 11, day: 11 }, // Armistice
    { type: 'fixed', month: 12, day: 25 },
  ],
  ES: [
    newYear,
    { type: 'fixed', month: 1, day: 6 },
    ...easterRules([-2]), // Good Friday
    { type: 'fixed', month: 5, day: 1 },
    { type: 'fixed', month: 8, day: 15 },
    { type: 'fixed', month: 10, day: 12 }, // Hispanic Day
    { type: 'fixed', month: 11, day: 1 },
    { type: 'fixed', month: 12, day: 6 }, // Constitution Day
    { type: 'fixed', month: 12, day: 8 },
    { type: 'fixed', month: 12, day: 25 },
  ],
  IT: [
    newYear,
    { type: 'fixed', month: 1, day: 6 },
    ...easterRules([1]), // Easter Monday
    { type: 'fixed', month: 4, day: 25 }, // Liberation Day
    { type: 'fixed', month: 5, day: 1 },
    { type: 'fixed', month: 6, day: 2 }, // Republic Day
    { type: 'fixed', month: 8, day: 15 },
    { type: 'fixed', month: 11, day: 1 },
    { type: 'fixed', month: 12, day: 8 },
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  NL: [
    newYear,
    ...easterRules([1, 39, 50]),
    { type: 'fixed', month: 4, day: 27 }, // King's Day
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  BE: [
    newYear,
    ...easterRules([1, 39, 50]),
    { type: 'fixed', month: 5, day: 1 },
    { type: 'fixed', month: 7, day: 21 }, // National Day
    { type: 'fixed', month: 8, day: 15 },
    { type: 'fixed', month: 11, day: 1 },
    { type: 'fixed', month: 11, day: 11 },
    { type: 'fixed', month: 12, day: 25 },
  ],
  AU: [
    newYear,
    { type: 'fixed', month: 1, day: 26 }, // Australia Day
    ...easterRules([-2, 1]),
    { type: 'fixed', month: 4, day: 25 }, // Anzac Day
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
  NZ: [
    newYear,
    { type: 'fixed', month: 1, day: 2 },
    { type: 'fixed', month: 2, day: 6 }, // Waitangi Day
    ...easterRules([-2, 1]),
    { type: 'fixed', month: 4, day: 25 },
    { type: 'nthWeekday', month: 6, weekday: 1, n: 1 }, // King's Birthday
    { type: 'nthWeekday', month: 10, weekday: 1, n: 4 }, // Labour Day
    { type: 'fixed', month: 12, day: 25 },
    { type: 'fixed', month: 12, day: 26 },
  ],
};

const pad = (n: number): string => (n < 10 ? '0' + n : '' + n);

const toISO = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

/**
 * computeEaster returns the Gregorian date of Easter Sunday for the provided
 * year using the Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 */
export const computeEaster = (year: number): { month: number; day: number } => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
};

const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/**
 * nthWeekdayOfMonth returns the ISO date of the nth weekday of a month. A
 * negative n counts back from the end of the month (-1 is the last occurrence).
 */
const nthWeekdayOfMonth = (
  year: number,
  month: number,
  weekday: number,
  n: number,
): string => {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return toISO(year, month, 1 + offset + (n - 1) * 7);
  }
  // Last (or nth-from-last) occurrence.
  const last = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return toISO(year, month, last.getUTCDate() - offset - (-n - 1) * 7);
};

const holidayCache = new Map<string, Set<string>>();

/**
 * holidaysForYear returns the set of ISO holiday dates for a country and year.
 * Results are memoized since the calendar is fixed.
 */
const holidaysForYear = (countryCode: string, year: number): Set<string> => {
  const key = `${countryCode}:${year}`;
  const cached = holidayCache.get(key);
  if (cached) {
    return cached;
  }

  const rules = countryRules[countryCode] || [];
  const easter = computeEaster(year);
  const easterISO = toISO(year, easter.month, easter.day);

  const dates = new Set<string>();
  rules.forEach((rule) => {
    switch (rule.type) {
      case 'fixed':
        dates.add(toISO(year, rule.month, rule.day));
        break;
      case 'easter':
        dates.add(addDaysISO(easterISO, rule.offset));
        break;
      case 'nthWeekday':
        dates.add(nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.n));
        break;
    }
  });

  holidayCache.set(key, dates);
  return dates;
};

/**
 * isWeekend returns true if the ISO date falls on a Saturday or Sunday.
 */
export const isWeekend = (iso: string): boolean => {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
};

/**
 * isHoliday returns true if the ISO date is a public holiday in the provided
 * country. An empty or unknown country code has no holidays.
 */
export const isHoliday = (iso: string, countryCode: string): boolean => {
  if (!countryCode) {
    return false;
  }
  const [year] = iso.split('-').map((n) => parseInt(n, 10));
  return holidaysForYear(countryCode, year).has(iso);
};

/**
 * isWorkday returns true when the ISO date is neither a weekend nor a public
 * holiday in the provided country.
 */
export const isWorkday = (iso: string, countryCode: string): boolean =>
  !isWeekend(iso) && !isHoliday(iso, countryCode);

/**
 * nextWorkday returns the provided ISO date if it is already a working day,
 * otherwise the next working day after it. A guard limits the search so an
 * unexpected input can never loop indefinitely.
 */
export const nextWorkday = (iso: string, countryCode: string): string => {
  let candidate = iso;
  for (let i = 0; i < 60 && !isWorkday(candidate, countryCode); i++) {
    candidate = addDaysISO(candidate, 1);
  }
  return candidate;
};
