/**
 * holidays.ts wraps the `date-holidays` library to provide the public-holiday
 * calendar used to adjust the evaluation date of recurring transactions onto a
 * working day. The library covers ~200 countries (including regional variants),
 * so it is far more reliable than a hand-maintained table.
 *
 * Saturdays and Sundays are always treated as non-working days regardless of the
 * selected country.
 */

import type { HolidaysTypes } from 'date-holidays';
import * as DateHolidaysModule from 'date-holidays';

export interface Country {
  code: string;
  name: string;
}

// date-holidays ships a CommonJS build whose module export *is* the constructor
// and an ESM build that exposes it as the default export. Normalize the two so
// the same code works under the rollup bundle and the (CommonJS) test runner
// without enabling `esModuleInterop` (which would break the `moment` imports in
// the test suite).
type HolidaysCtor = typeof DateHolidaysModule.default;
type HolidaysInstance = InstanceType<HolidaysCtor>;

const moduleExport = DateHolidaysModule as unknown as
  | HolidaysCtor
  | { default: HolidaysCtor };
const Holidays: HolidaysCtor =
  'default' in moduleExport ? moduleExport.default : moduleExport;

/**
 * supportedCountries is the list offered in the settings dropdown. The empty
 * code represents "weekends only" (no public-holiday calendar). The remaining
 * entries come from the library and are sorted by name.
 */
export const supportedCountries: Country[] = (() => {
  const countries = new Holidays().getCountries('en') as Record<string, string>;
  const list = Object.entries(countries)
    .map(([code, name]): Country => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [{ code: '', name: 'None (weekends only)' }, ...list];
})();

// Holidays instances are comparatively expensive to construct (they parse the
// country's holiday rules), so cache one per country. The timezone is pinned to
// UTC so a date is evaluated as the calendar day it represents, independent of
// the host machine's timezone.
const instances = new Map<string, HolidaysInstance>();

const getInstance = (countryCode: string): HolidaysInstance | undefined => {
  if (!countryCode) {
    return undefined;
  }
  let instance = instances.get(countryCode);
  if (!instance) {
    try {
      instance = new Holidays(countryCode, { timezone: 'UTC' });
    } catch (error) {
      console.error(`ledger: unknown holiday country "${countryCode}"`, error);
      return undefined;
    }
    instances.set(countryCode, instance);
  }
  return instance;
};

const pad = (n: number): string => (n < 10 ? '0' + n : '' + n);

const toISO = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

const parseUTC = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
};

const addDaysISO = (iso: string, days: number): string => {
  const dt = parseUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/**
 * isWeekend returns true if the ISO date falls on a Saturday or Sunday.
 */
export const isWeekend = (iso: string): boolean => {
  const day = parseUTC(iso).getUTCDay();
  return day === 0 || day === 6;
};

/**
 * isHoliday returns true if the ISO date is a public holiday in the provided
 * country. Only holidays of type `public` are considered (bank, optional,
 * school and observance days are ignored). An empty or unknown country code has
 * no holidays.
 */
export const isHoliday = (iso: string, countryCode: string): boolean => {
  const instance = getInstance(countryCode);
  if (!instance) {
    return false;
  }
  const result: HolidaysTypes.Holiday[] | false = instance.isHoliday(
    parseUTC(iso),
  );
  return result ? result.some((holiday) => holiday.type === 'public') : false;
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
