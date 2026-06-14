import {
  makeBalanceData,
  makeDeltaData,
  removeDuplicateAccounts,
} from '../balance-utils';
import {
  Interval,
  makeBucketNames,
  makeChartLabelFormatter,
} from '../date-utils';
import {
  ChartSegment,
  formatChartValue,
  formatExactValue,
  makeChartSegment,
  useStableListener,
} from './chartInteraction';
import Chartist, { IBarChartOptions, ILineChartOptions } from 'chartist';
import { Moment } from 'moment';
import { Platform } from 'obsidian';
import React from 'react';
import ChartistGraph from 'react-chartist';
import styled from 'styled-components';

const ChartHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
`;

const Legend = styled.div`
  margin-left: auto;
  min-width: 0;
  flex-shrink: 1;

  .ct-legend {
    margin: 0;
  }

  /*
  When there is not enough horizontal room (e.g. on mobile), allow the legend
  entries to wrap onto multiple lines and stack instead of overflowing and
  forcing the chart to scroll sideways.
  */
  .ct-legend li {
    display: inline-block;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
`;

const ChartTypeSelector = styled.div<{ $mobile: boolean }>`
  flex-shrink: 1;
  flex-grow: 0;

  /* Give the balance/profit-and-loss selector a bit of breathing room on
  mobile, where it sits stacked above the chart. */
  ${({ $mobile }) => ($mobile ? 'margin: 8px 0 14px;' : '')}
`;

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

  .ct-point,
  .ct-bar {
    cursor: pointer;
  }

  .ct-point-selected {
    stroke: var(--interactive-accent);
    stroke-width: 14px;
  }

  .ct-bar-selected {
    stroke: var(--interactive-accent);
    stroke-width: 12px;
  }

  .ct-bar-label,
  .ct-point-label {
    fill: var(--text-normal);
    font-size: 0.7rem;
  }
`;

export const AccountVisualization: React.FC<{
  dailyAccountBalanceMap: Map<string, Map<string, number>>;
  allAccounts: string[];
  selectedAccounts: string[];
  startDate: Moment;
  endDate: Moment;
  interval: Interval;
  currencySymbol: string;
  selectedSegment: ChartSegment | null;
  setSelectedSegment: (segment: ChartSegment | null) => void;
}> = (props): JSX.Element => {
  // TODO: Set the default mode based on the type of account selected
  const [mode, setMode] = React.useState('balance');

  const filteredAccounts = removeDuplicateAccounts(props.selectedAccounts);
  const dateBuckets = makeBucketNames(
    props.interval,
    props.startDate,
    props.endDate,
  );

  const visualization =
    mode === 'balance' ? (
      <BalanceVisualization
        dailyAccountBalanceMap={props.dailyAccountBalanceMap}
        allAccounts={props.allAccounts}
        accounts={filteredAccounts}
        dateBuckets={dateBuckets}
        interval={props.interval}
        currencySymbol={props.currencySymbol}
        selectedSegment={props.selectedSegment}
        setSelectedSegment={props.setSelectedSegment}
      />
    ) : (
      <DeltaVisualization
        dailyAccountBalanceMap={props.dailyAccountBalanceMap}
        allAccounts={props.allAccounts}
        accounts={filteredAccounts}
        dateBuckets={dateBuckets}
        startDate={props.startDate}
        interval={props.interval}
        currencySymbol={props.currencySymbol}
        selectedSegment={props.selectedSegment}
        setSelectedSegment={props.setSelectedSegment}
      />
    );

  return (
    <>
      <ChartHeader>
        <ChartTypeSelector $mobile={Platform.isMobile}>
          <select
            className="dropdown"
            value={mode}
            onChange={(e) => {
              props.setSelectedSegment(null);
              setMode(e.target.value);
            }}
          >
            <option value="balance">Account Balance</option>
            <option value="pnl">Profit and Loss</option>
          </select>
        </ChartTypeSelector>
        <Legend>
          <ul className="ct-legend">
            {filteredAccounts.map((account, i) => (
              <li key={account} className={`ct-series-${i}`}>
                {account}
              </li>
            ))}
          </ul>
        </Legend>
      </ChartHeader>

      <Chart>{visualization}</Chart>
    </>
  );
};

const BalanceVisualization: React.FC<{
  dailyAccountBalanceMap: Map<string, Map<string, number>>;
  allAccounts: string[];
  accounts: string[];
  dateBuckets: string[];
  interval: Interval;
  currencySymbol: string;
  selectedSegment: ChartSegment | null;
  setSelectedSegment: (segment: ChartSegment | null) => void;
}> = (props): JSX.Element => {
  const data = {
    labels: props.dateBuckets,
    series: props.accounts.map((account) =>
      makeBalanceData(
        props.dailyAccountBalanceMap,
        props.dateBuckets,
        account,
        props.allAccounts,
      ),
    ),
  };

  const options: ILineChartOptions = {
    height: '300px',
    width: '100%',
    showArea: false,
    showPoint: true,
    axisX: {
      labelInterpolationFnc: makeChartLabelFormatter(
        props.interval,
        props.dateBuckets.length,
      ),
    },
  };

  const listener = useStableListener((dpoint) => {
    if (dpoint.type !== 'point') {
      return;
    }
    if (props.selectedSegment?.index === dpoint.index) {
      dpoint.element.addClass('ct-point-selected');
      // Draw the exact value above each series' node at the selected date, so
      // that with multiple accounts visible each line shows its own value.
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
      const previousBoundary =
        dpoint.index > 0
          ? window.moment(props.dateBuckets[dpoint.index - 1])
          : window.moment(props.dateBuckets[0]).subtract(1, 'day');
      props.setSelectedSegment(
        makeChartSegment(
          props.dateBuckets,
          dpoint.index,
          previousBoundary,
          dpoint.value.y,
          props.interval,
        ),
      );
    });
  });

  return (
    <ChartistGraph
      data={data}
      options={options}
      type="Line"
      listener={listener}
    />
  );
};

const DeltaVisualization: React.FC<{
  dailyAccountBalanceMap: Map<string, Map<string, number>>;
  allAccounts: string[];
  accounts: string[];
  dateBuckets: string[];
  startDate: Moment;
  interval: Interval;
  currencySymbol: string;
  selectedSegment: ChartSegment | null;
  setSelectedSegment: (segment: ChartSegment | null) => void;
}> = (props): JSX.Element => {
  const bucketBefore = props.startDate
    .clone()
    .subtract(1, props.interval)
    .format('YYYY-MM-DD');

  const data = {
    labels: props.dateBuckets,
    series: props.accounts.map((account) =>
      makeDeltaData(
        props.dailyAccountBalanceMap,
        bucketBefore,
        props.dateBuckets,
        account,
        props.allAccounts,
      ),
    ),
  };

  const options: IBarChartOptions = {
    height: '300px',
    width: '100%',
    // Stack the per-account bars on top of each other for each date. Grouping
    // them side by side becomes unreadable once more than two accounts are
    // selected, as the bars get too thin and overflow into each other.
    stackBars: true,
    axisX: {
      labelInterpolationFnc: makeChartLabelFormatter(
        props.interval,
        props.dateBuckets.length,
      ),
    },
  };

  const listener = useStableListener((dpoint) => {
    if (dpoint.type !== 'bar') {
      return;
    }

    if (props.selectedSegment?.index === dpoint.index) {
      dpoint.element.addClass('ct-bar-selected');

      // The value labels are only shown for the selected date, where one is
      // drawn for each account's bar so every account's contribution is
      // visible. A zero bar means there were no transactions, so we leave it
      // unlabeled.
      const value = dpoint.value.y;
      if (value !== 0) {
        const label = new Chartist.Svg(
          'text',
          {
            x: dpoint.x1,
            y: value >= 0 ? dpoint.y2 - 6 : dpoint.y2 + 14,
            'text-anchor': 'middle',
          },
          'ct-bar-label',
        );
        label.text(formatChartValue(value, props.currencySymbol));
        dpoint.group.append(label);
      }
    }
    const node = dpoint.element.getNode();
    node.addEventListener('click', () => {
      if (props.selectedSegment?.index === dpoint.index) {
        props.setSelectedSegment(null);
        return;
      }
      // A bar represents the change over the interval ending at its bucket. For
      // the first bar that interval starts at the (synthetic) bucket before the
      // range, otherwise at the previous bucket.
      const previousBoundary =
        dpoint.index > 0
          ? window.moment(props.dateBuckets[dpoint.index - 1])
          : window.moment(bucketBefore);
      props.setSelectedSegment(
        makeChartSegment(
          props.dateBuckets,
          dpoint.index,
          previousBoundary,
          dpoint.value.y,
          props.interval,
        ),
      );
    });
  });

  return (
    <ChartistGraph
      data={data}
      options={options}
      type="Bar"
      listener={listener}
    />
  );
};
