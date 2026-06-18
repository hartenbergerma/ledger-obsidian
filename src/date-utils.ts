import { getWithDefault } from './generic-utils';
import { EnhancedTransaction } from './parser';
import { Moment } from 'moment';

export type Interval = 'day' | 'week' | 'month';

export type DateRange = 'month' | '6months' | 'year' | 'all' | 'custom';

export const dateRangeOptions: { id: DateRange; label: string }[] = [
  { id: 'month', label: 'Last Month' },
  { id: '6months', label: 'Last 6 Months' },
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
 * as the beginning of the 'all' range. For the 'custom' range the explicit
 * customStart and customEnd dates are used (falling back to the full data
 * window when they are not provided).
 */
export const resolveDateRange = (
  range: DateRange,
  firstTxDate: Moment,
  customStart?: Moment,
  customEnd?: Moment,
): { startDate: Moment; endDate: Moment; interval: Interval } => {
  const now = window.moment();
  let startDate: Moment;
  let endDate: Moment = now;
  switch (range) {
    case 'month':
      startDate = now.clone().subtract(1, 'month');
      break;
    case '6months':
      startDate = now.clone().subtract(6, 'months');
      break;
    case 'year':
      startDate = now.clone().subtract(1, 'year');
      break;
    case 'all':
      startDate = window.moment.min(firstTxDate.clone(), now);
      break;
    case 'custom':
      startDate = (customStart ?? firstTxDate).clone();
      endDate = (customEnd ?? now).clone();
      break;
  }
  return { startDate, endDate, interval: chooseInterval(startDate, endDate) };
};

/**
 * isDateRangeAvailable determines whether a named date range is worth offering
 * given the date of the oldest transaction. A "Last ..." range is only useful
 * when there is data older than the start of that range; otherwise it would
 * show exactly the same data as a shorter range or "All Time". The 'all' and
 * 'custom' ranges are always available.
 */
export const isDateRangeAvailable = (
  range: DateRange,
  firstTxDate: Moment,
  now: Moment = window.moment(),
): boolean => {
  let rangeStart: Moment;
  switch (range) {
    case 'month':
      rangeStart = now.clone().subtract(1, 'month');
      break;
    case '6months':
      rangeStart = now.clone().subtract(6, 'months');
      break;
    case 'year':
      rangeStart = now.clone().subtract(1, 'year');
      break;
    case 'all':
    case 'custom':
      return true;
  }
  return firstTxDate.isBefore(rangeStart);
};

/**
 * availableDateRangeOptions returns the subset of dateRangeOptions which are
 * meaningful for the provided oldest transaction date. "All Time" is always
 * included.
 */
export const availableDateRangeOptions = (
  firstTxDate: Moment,
  now: Moment = window.moment(),
): { id: DateRange; label: string }[] =>
  dateRangeOptions.filter(({ id }) =>
    isDateRangeAvailable(id, firstTxDate, now),
  );

/**
 * makeChartLabelFormatter creates a chartist label interpolation function
 * which formats bucket names for the provided interval and skips labels when
 * there are too many buckets to remain readable.
 */
export const makeChartLabelFormatter =
  (interval: Interval, bucketCount: number, maxLabels = 12) =>
  (value: string, index: number): string | null => {
    const everyNth = Math.ceil(bucketCount / maxLabels);
    if (index % everyNth !== 0) {
      return null;
    }
    const format = interval === 'month' ? 'MMM YYYY' : 'MMM D';
    return window.moment(value).format(format);
  };

/**
 * makeBucketNames creates a list of dates at the provided interval between the
 * startDate and the endDate.
 */
export const makeBucketNames = (
  interval: Interval,
  startDate: Moment,
  endDate: Moment,
): string[] => {
  const names: string[] = [];
  const currentDate = startDate.clone();

  do {
    names.push(currentDate.format('YYYY-MM-DD'));
    currentDate.add(1, interval);
  } while (currentDate.isSameOrBefore(endDate));

  // Always include the end of the range as the final bucket. When the range
  // does not divide evenly into the interval, the last generated bucket falls
  // before the end date. Previously this caused transactions occurring after
  // that bucket (e.g. in the most recent days) to be omitted from the chart,
  // even though they appeared in the transaction list below.
  const endName = endDate.format('YYYY-MM-DD');
  if (names[names.length - 1] !== endName) {
    names.push(endName);
  }

  return names;
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
