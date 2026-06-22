import {
  bucketTransactions,
  chooseInterval,
  makeAxisTicks,
  makeBucketNames,
  makeChartLabelFormatter,
  resolveDateRange,
} from '../src/date-utils';
import { EnhancedTransaction, FileBlock } from '../src/parser';
import * as moment from 'moment';

window.moment = moment;

const emptyBlock: FileBlock = {
  firstLine: -1,
  lastLine: -1,
  block: '',
};

describe('chooseInterval()', () => {
  test('short ranges use daily resolution', () => {
    expect(chooseInterval(moment('2021-12-01'), moment('2021-12-08'))).toEqual(
      'day',
    );
    expect(chooseInterval(moment('2021-11-08'), moment('2021-12-08'))).toEqual(
      'day',
    );
  });
  test('medium ranges use weekly resolution', () => {
    expect(chooseInterval(moment('2021-06-08'), moment('2021-12-08'))).toEqual(
      'week',
    );
  });
  test('long ranges use monthly resolution', () => {
    expect(chooseInterval(moment('2020-12-08'), moment('2021-12-08'))).toEqual(
      'month',
    );
  });
});

describe('resolveDateRange()', () => {
  const firstTxDate = moment('2021-01-15');
  test.each([
    ['month', 'day'],
    ['year', 'month'],
  ] as const)('%p range uses %p resolution', (range, interval) => {
    const result = resolveDateRange(range, firstTxDate);
    expect(result.interval).toEqual(interval);
    expect(result.endDate.isSame(moment(), 'day')).toBeTruthy();
  });
  test('all time starts at the first transaction', () => {
    const result = resolveDateRange('all', firstTxDate);
    expect(result.startDate.isSame(firstTxDate, 'day')).toBeTruthy();
    expect(result.endDate.isSame(moment(), 'day')).toBeTruthy();
  });
  test('all time with a recent first transaction uses daily resolution', () => {
    const recentFirstTxDate = moment().subtract(3, 'days');
    const result = resolveDateRange('all', recentFirstTxDate);
    expect(result.interval).toEqual('day');
  });
});

describe('makeChartLabelFormatter()', () => {
  test('formats day buckets without skipping when there are few', () => {
    const formatter = makeChartLabelFormatter('day', 7);
    expect(formatter('2021-12-01', 0)).toEqual('Dec 1');
    expect(formatter('2021-12-02', 1)).toEqual('Dec 2');
  });
  test('skips labels when there are many buckets', () => {
    const formatter = makeChartLabelFormatter('day', 31);
    expect(formatter('2021-12-01', 0)).toEqual('Dec 1');
    expect(formatter('2021-12-02', 1)).toBeNull();
    expect(formatter('2021-12-04', 3)).toEqual('Dec 4');
  });
  test('formats month buckets with the year', () => {
    const formatter = makeChartLabelFormatter('month', 12);
    expect(formatter('2021-12-01', 0)).toEqual('Dec 2021');
  });
});

describe('makeBucketNames()', () => {
  // The end date is always included as the final bucket so that the most recent
  // transactions are represented in the chart, even when the range does not
  // divide evenly into the interval.
  describe('week', () => {
    test('less than a week', () => {
      const result = makeBucketNames(
        'week',
        moment('2021-12-01'),
        moment('2021-12-03'),
      );
      expect(result).toEqual(['2021-12-01', '2021-12-03']);
    });
    test('exactly a week', () => {
      const result = makeBucketNames(
        'week',
        moment('2021-12-01'),
        moment('2021-12-07'),
      );
      expect(result).toEqual(['2021-12-01', '2021-12-07']);
    });
    test('exactly 8 days', () => {
      const result = makeBucketNames(
        'week',
        moment('2021-12-01'),
        moment('2021-12-08'),
      );
      expect(result).toEqual(['2021-12-01', '2021-12-08']);
    });
    test('longer', () => {
      const result = makeBucketNames(
        'week',
        moment('2021-11-01'),
        moment('2021-12-08'),
      );
      expect(result).toEqual([
        '2021-11-01',
        '2021-11-08',
        '2021-11-15',
        '2021-11-22',
        '2021-11-29',
        '2021-12-06',
        '2021-12-08',
      ]);
    });
  });
  describe('month', () => {
    test('less than a month', () => {
      const result = makeBucketNames(
        'month',
        moment('2021-12-01'),
        moment('2021-12-03'),
      );
      expect(result).toEqual(['2021-12-01', '2021-12-03']);
    });
    test('slightly over a month', () => {
      const result = makeBucketNames(
        'month',
        moment('2021-12-01'),
        moment('2022-01-01'),
      );
      expect(result).toEqual(['2021-12-01', '2022-01-01']);
    });
    test('does not duplicate the end date when it aligns to a bucket', () => {
      const result = makeBucketNames(
        'month',
        moment('2021-10-01'),
        moment('2021-12-01'),
      );
      expect(result).toEqual(['2021-10-01', '2021-11-01', '2021-12-01']);
    });
  });
});

describe('makeAxisTicks()', () => {
  test('month ticks fall on the first of each month within the range', () => {
    const start = moment('2025-10-15');
    const end = moment('2026-06-10');
    const buckets = makeBucketNames('month', start, end);
    const ticks = makeAxisTicks('month', start, end, buckets).map((t) =>
      moment(t).format('YYYY-MM-DD'),
    );
    // The partial first (Oct 15) and last (Jun 10) days are not ticks; the
    // month boundaries between them are.
    expect(ticks).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
  });
  test('a start on the first of a month is kept as a tick', () => {
    const start = moment('2025-10-01');
    const end = moment('2025-12-01');
    const buckets = makeBucketNames('month', start, end);
    const ticks = makeAxisTicks('month', start, end, buckets).map((t) =>
      moment(t).format('YYYY-MM-DD'),
    );
    expect(ticks).toEqual(['2025-10-01', '2025-11-01', '2025-12-01']);
  });
  test('non-month intervals tick at the bucket dates', () => {
    const start = moment('2021-12-01');
    const end = moment('2021-12-03');
    const buckets = makeBucketNames('day', start, end);
    const ticks = makeAxisTicks('day', start, end, buckets).map((t) =>
      moment(t).format('YYYY-MM-DD'),
    );
    expect(ticks).toEqual(buckets);
  });
});

describe('bucketTransaction()', () => {
  const tx1: EnhancedTransaction = {
    type: 'tx',
    blockLine: -1,
    block: emptyBlock,
    value: {
      date: '2021-12-31',
      payee: 'Costco',
      expenselines: [],
    },
  };
  const tx2: EnhancedTransaction = {
    type: 'tx',
    blockLine: -1,
    block: emptyBlock,
    value: {
      date: '2021-12-15',
      payee: "Trader Joe's",
      expenselines: [],
    },
  };
  const tx3: EnhancedTransaction = {
    type: 'tx',
    blockLine: -1,
    block: emptyBlock,
    value: {
      date: '2021-11-29',
      payee: 'PCC',
      expenselines: [],
    },
  };
  test('when there is only one bucket', () => {
    const result = bucketTransactions(['2021-11-15'], [tx1, tx2, tx3]);
    const entries = [...result.entries()];
    expect(entries).toEqual([[moment('2021-11-15'), [tx1, tx2, tx3]]]);
  });
  test('when a transaction is past the last bucket', () => {
    const result = bucketTransactions(
      ['2021-11-15', '2021-12-01'],
      [tx1, tx2, tx3],
    );
    const entries = [...result.entries()];
    expect(entries).toEqual([
      [moment('2021-11-15'), [tx3]],
      [moment('2021-12-01'), [tx1, tx2]],
    ]);
  });
  test('when there is a transaction exactly on a bucket date', () => {
    const result = bucketTransactions(
      ['2021-11-15', '2021-12-01', '2021-12-15'],
      [tx1, tx2, tx3],
    );
    const entries = [...result.entries()];
    expect(entries).toEqual([
      [moment('2021-11-15'), [tx3]],
      [moment('2021-12-01'), []],
      [moment('2021-12-15'), [tx1, tx2]],
    ]);
  });
  test('when there is a transaction right before a bucket date', () => {
    const result = bucketTransactions(
      ['2021-11-15', '2021-12-01', '2021-12-16'],
      [tx1, tx2, tx3],
    );
    const entries = [...result.entries()];
    expect(entries).toEqual([
      [moment('2021-11-15'), [tx3]],
      [moment('2021-12-01'), [tx2]],
      [moment('2021-12-16'), [tx1]],
    ]);
  });
});
