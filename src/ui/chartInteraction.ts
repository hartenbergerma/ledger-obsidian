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
  /** A human readable label for the segment, e.g. "KW15 (23.03.-29.03.26)". */
  label: string;
}

/**
 * formatSegmentLabel builds the human readable label shown above the
 * transaction list for a selected segment. The format depends on the interval:
 *  - day:   the date itself, e.g. "23.03.26".
 *  - week:  the calendar week and date range, e.g. "KW15 (23.03.-29.03.26)".
 *  - month: the month name and date range, e.g. "March (01.03.-31.03.26)".
 */
export const formatSegmentLabel = (
  filterStart: Moment,
  filterEnd: Moment,
  interval: Interval,
): string => {
  const range = `${filterStart.format('DD.MM.')}-${filterEnd.format(
    'DD.MM.YY',
  )}`;
  switch (interval) {
    case 'day':
      return filterEnd.format('DD.MM.YY');
    case 'week':
      return `KW${filterEnd.isoWeek()} (${range})`;
    case 'month':
      return `${filterEnd.format('MMMM')} (${range})`;
  }
};

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
  let filterEnd = window.moment(buckets[index]);
  let filterStart = previousBoundary.clone().add(1, 'day');
  if (interval === 'month' && index > 0) {
    if (filterEnd.date() === 1) {
      // Bucket lands on the 1st: it represents the complete preceding calendar
      // month, so shift the window back to 1st–last of that month.
      filterEnd = filterEnd.clone().subtract(1, 'day');
      filterStart = filterEnd.clone().startOf('month');
    } else {
      // Partial month at the end of the range: show from the 1st of that month.
      filterStart = filterEnd.clone().startOf('month');
    }
  }
  return {
    index,
    filterStart,
    filterEnd,
    value,
    label: formatSegmentLabel(filterStart, filterEnd, interval),
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
 * splitXAxisLabel intercepts a Chartist label draw event and, when running on
 * mobile, replaces the single-line label with two lines (text before the last
 * space on top, text after it below) centered on the tick. On desktop labels
 * stay single-line because there is enough horizontal room. Returns true when
 * the event was handled (whether or not a split occurred) so callers can
 * short-circuit further processing.
 *
 * Chartist renders axis labels as either:
 *  - a plain SVG <text> element (older environments), or
 *  - a <foreignObject> containing an HTML <div> (modern Electron/Chromium,
 *    where document.implementation.hasFeature always returns true).
 * Both cases are handled here.
 */
export const splitXAxisLabel = (dpoint: any, mobile: boolean): boolean => {
  if (dpoint.type !== 'label') return false;
  if (dpoint.axis?.units?.pos !== 'x') return false;
  if (!mobile) return false;

  const text: string = dpoint.text ?? '';
  const spaceIdx = text.lastIndexOf(' ');
  if (spaceIdx < 0) return false;

  const top = text.slice(0, spaceIdx);
  const bottom = text.slice(spaceIdx + 1);
  const el = dpoint.element.getNode() as Element;
  const nodeName = el.nodeName.toLowerCase();

  if (nodeName === 'foreignobject') {
    // Modern Electron/Chromium: label is an HTML <div> inside a <foreignObject>.
    const div = el.querySelector('div');
    if (div) {
      div.innerHTML = `${top}<br>${bottom}`;
      div.style.textAlign = 'center';
    }
    return true;
  }

  if (nodeName === 'text') {
    // Plain SVG <text>: replace content with two <tspan> children.
    const x = el.getAttribute('x') ?? '0';
    el.textContent = '';
    const addTspan = (label: string, dy: string): void => {
      const tspan = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'tspan',
      );
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', dy);
      tspan.textContent = label;
      el.appendChild(tspan);
    };
    // Shift the first line up and the second down so the pair is centered
    // where the original single-line label would have been.
    addTspan(top, '-0.5em');
    addTspan(bottom, '1.2em');
    return true;
  }

  return false;
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
