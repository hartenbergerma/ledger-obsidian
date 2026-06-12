import { getWithDefault } from './generic-utils';
import { EnhancedTransaction } from './parser';
import { Moment } from 'moment';

export type Interval = 'day' | 'week' | 'month';

export type DateRange = 'week' | 'month' | '6months' | 'year' | 'all';

export const dateRangeOptions: { id: DateRange; label: string }[] = [
  { id: 'week', label: 'Last Week' },
  { id: 'month', label: 'Last Month' },
  { id: '6months', label: 'Last 6 Months' },
  { id: 'year', label: 'Last Year' },
  { id: 'all', label: 'All Time' },
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
    case 'week':
      startDate = endDate.clone().subtract(1, 'week');
      break;
    case 'month':
      startDate = endDate.clone().subtract(1, 'month');
      break;
    case '6months':
      startDate = endDate.clone().subtract(6, 'months');
      break;
    case 'year':
      startDate = endDate.clone().subtract(1, 'year');
      break;
    case 'all':
      startDate = window.moment.min(firstTxDate.clone(), endDate);
      break;
  }
  return { startDate, endDate, interval: chooseInterval(startDate, endDate) };
};

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
  // TODO: We need to make sure the end of the range is captured. Right now it
  // seems there is either bug here or where we put data into the buckets which
  // is preventing all the transactions from being represented in the chart.

  const names: string[] = [];
  const currentDate = startDate.clone();

  do {
    names.push(currentDate.format('YYYY-MM-DD'));
    currentDate.add(1, interval);
  } while (currentDate.isSameOrBefore(endDate));

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
