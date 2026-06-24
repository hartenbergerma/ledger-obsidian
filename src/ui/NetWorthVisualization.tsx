import { makeNetWorthData } from '../balance-utils';
import {
  Interval,
  makeAxisTicks,
  makeBucketNames,
  makeChartLabelFormatter,
} from '../date-utils';
import { TransactionCache } from '../parser';
import {
  alignYAxisLabel,
  ChartSegment,
  formatChartValue,
  formatExactValue,
  makeChartSegment,
  splitXAxisLabel,
  useStableListener,
} from './chartInteraction';
import Chartist, { ILineChartOptions } from 'chartist';
import { union } from 'lodash';
import { Moment } from 'moment';
import React from 'react';
import ChartistGraph from 'react-chartist';
import styled from 'styled-components';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const Chart = styled.div`
  .ct-label {
    color: var(--text-muted);
  }

  /* Allow two-line x-axis labels to extend below the SVG boundary. */
  svg {
    overflow: visible;
  }

  /*
  Make grid lines consistently visible. The Chartist defaults are nearly
  invisible against the desktop theme and entirely absent on mobile.
  */
  .ct-grid {
    stroke: var(--background-modifier-border);
    stroke-width: 1px;
    stroke-dasharray: 2px;
  }

  /*
  Restore Chartist's intended right-alignment for y-axis labels. Obsidian's
  global CSS overrides the Chartist-bundled .ct-label.ct-vertical.ct-start
  rule, making labels left-aligned so they spill into the plot area. Scoping
  this rule inside the styled-component class raises its specificity above any
  single-class selector in the theme. !important is needed only as a fallback
  against theme rules that already use it.
  */
  .ct-label.ct-vertical.ct-start {
    display: flex !important;
    justify-content: flex-end !important;
    align-items: center !important;
    text-align: right !important;
    white-space: nowrap !important;
  }

  .ct-point {
    cursor: pointer;
  }

  .ct-point-selected {
    stroke: var(--interactive-accent);
    stroke-width: 14px;
  }

  .ct-point-label {
    fill: var(--text-normal);
    font-size: 0.7rem;
    /* Halo in the background color so the value stays legible over the line
    and grid. See AccountVisualization for details. */
    paint-order: stroke;
    stroke: var(--background-primary);
    stroke-width: 3px;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
`;

export const NetWorthVisualization: React.FC<{
  dailyAccountBalanceMap: Map<string, Map<string, number>>;
  startDate: Moment;
  endDate: Moment;
  interval: Interval;
  txCache: TransactionCache;
  currencySymbol: string;
  selectedSegment: ChartSegment | null;
  setSelectedSegment: (segment: ChartSegment | null) => void;
}> = (props): JSX.Element => {
  const dateBuckets = makeBucketNames(
    props.interval,
    props.startDate,
    props.endDate,
  );
  const netWorthAccounts = React.useMemo(
    () =>
      new Set(
        union(props.txCache.assetAccounts, props.txCache.liabilityAccounts),
      ),
    [props.txCache],
  );

  // Position each point at its true date on a numeric time axis and drop the
  // buckets that fall before the first recorded transaction (their value is
  // null). The axis ticks are placed at calendar boundaries independently, so
  // a point on e.g. the 15th sits between two month ticks.
  const points = makeNetWorthData(
    props.dailyAccountBalanceMap,
    dateBuckets,
    netWorthAccounts,
  )
    .map((d, i) => ({
      bucket: dateBuckets[i],
      x: window.moment(dateBuckets[i]).valueOf(),
      y: d.y,
    }))
    .filter((p): p is { bucket: string; x: number; y: number } => p.y !== null);
  const visibleBuckets = points.map((p) => p.bucket);
  const ticks = makeAxisTicks(
    props.interval,
    props.startDate,
    props.endDate,
    dateBuckets,
  );

  const data = {
    series: [points.map((p) => ({ x: p.x, y: p.y }))],
  };

  // Guard against a zero-width axis (start === end) which would make Chartist
  // divide by zero when projecting points.
  const low = props.startDate.valueOf();
  const high = Math.max(props.endDate.valueOf(), low + MS_PER_DAY);

  const options: ILineChartOptions = {
    height: '300px',
    width: '100%',
    showArea: false,
    showPoint: true,
    axisY: {
      // Compact labels (e.g. "€12k") let us keep a narrower gutter.
      labelInterpolationFnc: (value: number) =>
        formatChartValue(value, props.currencySymbol),
      offset: 50,
    },
    axisX: {
      type: Chartist.FixedScaleAxis,
      low,
      high,
      ticks,
      labelInterpolationFnc: makeChartLabelFormatter(
        props.interval,
        ticks.length,
      ),
    } as any,
  };

  const listener = useStableListener((dpoint) => {
    if (splitXAxisLabel(dpoint)) return;
    if (alignYAxisLabel(dpoint)) return;
    if (dpoint.type !== 'point') {
      return;
    }
    if (props.selectedSegment?.index === dpoint.index) {
      dpoint.element.addClass('ct-point-selected');
      // Show the exact value above the selected node, on the graph itself.
      const label = new Chartist.Svg(
        'text',
        { x: dpoint.x, y: dpoint.y - 12, 'text-anchor': 'middle' },
        'ct-point-label',
      );
      label.text(formatExactValue(dpoint.value.y, props.currencySymbol));
      dpoint.group.append(label);
    }
    const node = dpoint.element.getNode();
    node.addEventListener('click', () => {
      if (props.selectedSegment?.index === dpoint.index) {
        props.setSelectedSegment(null);
        return;
      }
      // The first point has no preceding bucket within the range, so use the
      // day before so that selecting it shows transactions on that opening day.
      const previousBoundary =
        dpoint.index > 0
          ? window.moment(visibleBuckets[dpoint.index - 1])
          : window.moment(visibleBuckets[0]).subtract(1, 'day');
      props.setSelectedSegment(
        makeChartSegment(
          visibleBuckets,
          dpoint.index,
          previousBoundary,
          dpoint.value.y,
          props.interval,
        ),
      );
    });
  });

  return (
    <>
      <h2>Net Worth</h2>
      <i>Assets minus liabilities</i>

      <Chart>
        <ChartistGraph
          data={data}
          options={options}
          type="Line"
          listener={listener}
        />
      </Chart>
    </>
  );
};
