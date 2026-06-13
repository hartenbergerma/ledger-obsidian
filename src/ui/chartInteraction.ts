import { Interval } from '../date-utils';
import { Moment } from 'moment';
import React from 'react';

/**
 * A ChartSegment represents a single clicked point (line chart) or bar (bar
 * chart) on a dashboard chart. It carries the date window that the segment
 * covers so that the transaction list below the chart can be narrowed to only
 * the transactions which occurred during that segment (e.g. the transactions
 * responsible for a particular dip or rise).
 */
export interface ChartSegment {
  /** Index of the clicked point/bar within the chart's date buckets. */
  index: number;
  /** Inclusive lower bound of the transactions belonging to this segment. */
  filterStart: Moment;
  /** Inclusive upper bound of the transactions belonging to this segment. */
  filterEnd: Moment;
  /** The value of the point/bar that was clicked. */
  value: number;
  /** A human readable label for the segment, e.g. "Mar 1, 2026". */
  label: string;
}

/**
 * makeChartSegment builds a ChartSegment for the bucket at the provided index.
 * The transactions belonging to the segment are those which occurred strictly
 * after the previous boundary, up to and including the bucket date. This means
 * clicking a point or bar selects exactly the transactions which caused the
 * change leading up to that point.
 */
export const makeChartSegment = (
  buckets: string[],
  index: number,
  previousBoundary: Moment,
  value: number,
  interval: Interval,
): ChartSegment => {
  const filterEnd = window.moment(buckets[index]);
  const filterStart = previousBoundary.clone().add(1, 'day');
  const format = interval === 'month' ? 'MMM YYYY' : 'MMM D, YYYY';
  return {
    index,
    filterStart,
    filterEnd,
    value,
    label: filterEnd.format(format),
  };
};

/**
 * useStableListener wraps a Chartist `draw` event handler so that the object
 * passed to react-chartist keeps a stable identity (react-chartist only binds
 * the listener once, when the chart is created) while always invoking the most
 * recent version of the handler. Without this, the handler would capture stale
 * props/state from the render in which the chart was first created.
 */
export const useStableListener = (
  draw: (data: any) => void,
): { draw: (data: any) => void } => {
  const ref = React.useRef(draw);
  ref.current = draw;
  return React.useMemo(() => ({ draw: (data: any) => ref.current(data) }), []);
};

/**
 * formatChartValue formats a value for display directly on a chart (e.g. a bar
 * label) using a compact notation so it does not overflow the available space.
 */
export const formatChartValue = (value: number, symbol: string): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  let body: string;
  if (abs >= 1_000_000) {
    body = `${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  } else if (abs >= 1_000) {
    body = `${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  } else {
    body = abs.toFixed(0);
  }
  return `${sign}${symbol}${body}`;
};

/**
 * formatExactValue formats a value with full precision and thousands
 * separators, used for the highlighted value of a selected segment.
 */
export const formatExactValue = (value: number, symbol: string): string => {
  const sign = value < 0 ? '-' : '';
  const body = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol}${body}`;
};
