import { getWithDefault } from './generic-utils';
import { EnhancedTransaction } from './parser';
import { Moment } from 'moment';

export type Interval = 'day' | 'week' | 'month';

export type DateRange = 'month' | 'year' | 'all' | 'custom';

export const dateRangeOptions: { id: DateRange; label: string }[] = [
  { id: 'month', label: 'Last Month' },
  { id: 'year', label: 'Last Year' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

/**
 * chooseInterval selects a graph resolution which keeps the number of data
 * points reasonable for the provided date range.
 */
export const chooseInterval = (
  startDate: Moment,
  endDate: Moment,
): Interval => {
  const days = endDate.diff(startDate, 'days');
  if (days <= 35) {
    return 'day';
  } else if (days <= 200) {
    return 'week';
  }
  return 'month';
};

/**
 * resolveDateRange converts a named date range into concrete start and end
 * dates and an automatically chosen graph resolution. The firstTxDate is used
 * as the beginning of the 'all' range.
 */
export const resolveDateRange = (
  range: DateRange,
  firstTxDate: Moment,
): { startDate: Moment; endDate: Moment; interval: Interval } => {
  const endDate = window.moment();
  let startDate: Moment;
  switch (range) {
    case 'month':
      startDate = endDate.clone().subtract(1, 'month');
      break;
    case 'year':
      startDate = endDate.clone().subtract(1, 'year');
      break;
    case 'all':
      startDate = window.moment.min(firstTxDate.clone(), endDate);
      break;
    case 'custom':
      // Custom ranges are resolved externally via chooseInterval; fall back to all-time.
      startDate = window.moment.min(firstTxDate.clone(), endDate);
      break;
  }
  return { startDate, endDate, interval: chooseInterval(startDate, endDate) };
};

/**
 * makeChartLabelFormatter creates a chartist label interpolation function
 * which formats bucket names (or axis tick timestamps) for the provided
 * interval and skips labels when there are too many to remain readable.
 */
export const makeChartLabelFormatter =
  (interval: Interval, tickCount: number, maxLabels = 12) =>
  (value: string | number, index: number): string | null => {
    const everyNth = Math.ceil(tickCount / maxLabels);
    if (index % everyNth !== 0) {
      return null;
    }
    const format = interval === 'month' ? 'MMM YY' : 'MMM D';
    return window.moment(value).format(format);
  };

/**
 * makeBucketNames creates a list of dates at the provided interval between the
 * startDate and the endDate.
 *
 * For month and week intervals, intermediate buckets snap to calendar
 * boundaries (1st of each month / Monday of each ISO week) so they align with
 * the axis tick marks. Only the first bucket (startDate) and last bucket
 * (endDate) can fall on arbitrary days. For day intervals the buckets step
 * uniformly from the startDate.
 */
export const makeBucketNames = (
  interval: Interval,
  startDate: Moment,
  endDate: Moment,
): string[] => {
  const names: string[] = [];
  names.push(startDate.format('YYYY-MM-DD'));

  if (interval === 'month') {
    const currentDate = startDate.clone().startOf('month').add(1, 'month');
    while (currentDate.isBefore(endDate)) {
      names.push(currentDate.format('YYYY-MM-DD'));
      currentDate.add(1, 'month');
    }
  } else if (interval === 'week') {
    const currentDate = startDate.clone().startOf('isoWeek').add(1, 'week');
    while (currentDate.isBefore(endDate)) {
      names.push(currentDate.format('YYYY-MM-DD'));
      currentDate.add(1, 'week');
    }
  } else {
    const currentDate = startDate.clone().add(1, interval);
    while (currentDate.isBefore(endDate)) {
      names.push(currentDate.format('YYYY-MM-DD'));
      currentDate.add(1, interval);
    }
  }

  // Always include the end date as the final bucket, deduplicated.
  const endName = endDate.format('YYYY-MM-DD');
  if (names[names.length - 1] !== endName) {
    names.push(endName);
  }

  return names;
};

/**
 * makeAxisTicks returns the x-axis tick positions (as millisecond timestamps)
 * for a time-based chart axis. The data points are positioned by their actual
 * date, so the ticks are placed at meaningful calendar boundaries rather than
 * at the data points themselves:
 *  - month: the first of each month within the range, so a point on e.g. the
 *    15th sits halfway between two month ticks instead of on top of one.
 *  - week: Monday of each ISO week within the range, so off-week-start points
 *    sit between ticks.
 *  - day: the bucket dates themselves, which are already evenly spaced.
 */
export const makeAxisTicks = (
  interval: Interval,
  startDate: Moment,
  endDate: Moment,
  bucketNames: string[],
): number[] => {
  if (interval === 'day') {
    return bucketNames.map((name) => window.moment(name).valueOf());
  }

  if (interval === 'week') {
    const ticks: number[] = [];
    const currentDate = startDate.clone().startOf('isoWeek');
    // Skip a leading partial week so the first tick is not before the axis
    // start. A start date that is already Monday is kept.
    if (currentDate.isBefore(startDate)) {
      currentDate.add(1, 'week');
    }
    while (currentDate.isSameOrBefore(endDate)) {
      ticks.push(currentDate.valueOf());
      currentDate.add(1, 'week');
    }
    return ticks;
  }

  // month
  const ticks: number[] = [];
  const currentDate = startDate.clone().startOf('month');
  // Skip a leading partial month so the first tick is not drawn before the
  // start of the axis. A start date that already falls on the 1st is kept.
  if (currentDate.isBefore(startDate)) {
    currentDate.add(1, 'month');
  }
  while (currentDate.isSameOrBefore(endDate)) {
    ticks.push(currentDate.valueOf());
    currentDate.add(1, 'month');
  }
  return ticks;
};

/**
 * bucketTransactions sorts the provided transactions into the appropriate
 * bucket name provided. Transactions will be put in the bucket whose name is
 * most closely the same or before the transaction date.
 *
 * Assumes that bucketNames are in chronological order from earliest to latest.
 */
export const bucketTransactions = (
  bucketNames: string[],
  txs: EnhancedTransaction[],
): Map<Moment, EnhancedTransaction[]> => {
  let firstBucketMoment: Moment;
  const restBucketMoments: Moment[] = [];
  const buckets = new Map<Moment, EnhancedTransaction[]>();
  bucketNames.forEach((name, i) => {
    const m = window.moment(name);
    buckets.set(m, []);

    if (i === 0) {
      firstBucketMoment = m;
    } else {
      restBucketMoments.push(m);
    }
  });

  const makeEmptyBucket = (): EnhancedTransaction[] => [];
  txs.forEach((tx) => {
    let prevBucket = firstBucketMoment;
    for (let i = 0; i < restBucketMoments.length; i++) {
      const m = window.moment(tx.value.date);
      if (m.isBefore(restBucketMoments[i])) {
        break;
      }
      prevBucket = restBucketMoments[i];
    }

    // getWithDefault is only necessary for the type checker here. We just put
    // this bucket in the map, so it will not be missing.
    getWithDefault(buckets, prevBucket, makeEmptyBucket).push(tx);
  });

  return buckets;
};
