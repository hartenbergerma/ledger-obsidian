import {
  formatChartValue,
  formatExactValue,
  makeChartSegment,
} from '../src/ui/chartInteraction';
import * as moment from 'moment';

window.moment = moment;

describe('makeChartSegment()', () => {
  const buckets = ['2026-01-01', '2026-02-01', '2026-03-01'];

  test('shows the complete preceding calendar month for a bucket on the 1st', () => {
    const segment = makeChartSegment(
      buckets,
      2,
      window.moment('2026-02-01'),
      1234,
      'month',
    );
    expect(segment.index).toEqual(2);
    // Bucket 2026-03-01 (1st of March) → show February: 2026-02-01 to 2026-02-28
    expect(segment.filterStart.format('YYYY-MM-DD')).toEqual('2026-02-01');
    expect(segment.filterEnd.format('YYYY-MM-DD')).toEqual('2026-02-28');
    expect(segment.value).toEqual(1234);
  });

  test('formats the label using the month name and date range for a monthly interval', () => {
    const segment = makeChartSegment(
      buckets,
      1,
      window.moment('2026-01-01'),
      0,
      'month',
    );
    // Bucket 2026-02-01 (1st of Feb) → show January: 2026-01-01 to 2026-01-31
    expect(segment.label).toEqual('January (01.01.-31.01.26)');
  });

  test('formats the label using just the date for a daily interval', () => {
    const segment = makeChartSegment(
      buckets,
      1,
      window.moment('2026-01-01'),
      0,
      'day',
    );
    expect(segment.label).toEqual('01.02.26');
  });

  test('formats the label using the calendar week and date range for a weekly interval', () => {
    const weeklyBuckets = ['2026-03-15', '2026-03-22', '2026-03-29'];
    const segment = makeChartSegment(
      weeklyBuckets,
      2,
      window.moment('2026-03-22'),
      0,
      'week',
    );
    expect(segment.label).toEqual('KW13 (23.03.-29.03.26)');
  });

  test('does not mutate the provided previous boundary', () => {
    const prev = window.moment('2026-02-01');
    makeChartSegment(buckets, 2, prev, 0, 'month');
    expect(prev.format('YYYY-MM-DD')).toEqual('2026-02-01');
  });
});

describe('formatChartValue()', () => {
  test('formats small values exactly', () => {
    expect(formatChartValue(42, '$')).toEqual('$42');
  });

  test('abbreviates thousands', () => {
    expect(formatChartValue(1500, '$')).toEqual('$1.5k');
    expect(formatChartValue(2000, '$')).toEqual('$2k');
  });

  test('abbreviates millions', () => {
    expect(formatChartValue(3_200_000, '$')).toEqual('$3.2M');
  });

  test('keeps the sign in front of the symbol', () => {
    expect(formatChartValue(-1500, '$')).toEqual('-$1.5k');
  });
});

describe('formatExactValue()', () => {
  test('formats with two decimals and thousands separators', () => {
    expect(formatExactValue(1234.5, '$')).toEqual('$1,234.50');
  });

  test('keeps the sign in front of the symbol', () => {
    expect(formatExactValue(-1234.5, '$')).toEqual('-$1,234.50');
  });
});
