import { makeNetWorthData } from '../balance-utils';
import {
  Interval,
  makeBucketNames,
  makeChartLabelFormatter,
} from '../date-utils';
import { TransactionCache } from '../parser';
import {
  ChartSegment,
  formatExactValue,
  makeChartSegment,
  useStableListener,
} from './chartInteraction';
import Chartist, { ILineChartOptions } from 'chartist';
import { union } from 'lodash';
import { Moment } from 'moment';
import React from 'react';
import ChartistGraph from 'react-chartist';
import styled from 'styled-components';

const Chart = styled.div`
  .ct-label {
    color: var(--text-muted);
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
  const data = {
    labels: dateBuckets,
    series: [
      makeNetWorthData(
        props.dailyAccountBalanceMap,
        dateBuckets,
        netWorthAccounts,
      ),
    ],
  };

  const options: ILineChartOptions = {
    height: '300px',
    width: '100%',
    showArea: false,
    showPoint: true,
    axisX: {
      labelInterpolationFnc: makeChartLabelFormatter(
        props.interval,
        dateBuckets.length,
      ),
    },
  };

  const listener = useStableListener((dpoint) => {
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
          ? window.moment(dateBuckets[dpoint.index - 1])
          : window.moment(dateBuckets[0]).subtract(1, 'day');
      props.setSelectedSegment(
        makeChartSegment(
          dateBuckets,
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
