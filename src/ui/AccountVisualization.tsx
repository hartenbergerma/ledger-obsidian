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
    /* A little breathing room above and below the legend block. */
    margin: 10px 0;
    text-align: left;
  }

  /*
  When there is not enough horizontal room (e.g. on mobile), allow the legend
  entries to wrap onto multiple lines and stack instead of overflowing and
  forcing the chart to scroll sideways. Each entry sits on its own line,
  left-aligned, with a little space between rows.
  */
  .ct-legend li {
    display: block;
    text-align: left;
    max-width: 100%;
    overflow-wrap: anywhere;
    margin-bottom: 8px;
  }

  .ct-legend li:last-child {
    margin-bottom: 0;
  }
`;

const ChartTypeSelector = styled.div<{ $mobile: boolean }>`
  flex-shrink: 1;
  flex-grow: 0;

  /* Give the balance/profit-and-loss selector a bit of breathing room on
  mobile, where it sits stacked above the chart. */
  ${({ $mobile }) => ($mobile ? 'margin: 8px 0 14px;' : '')}
`;

const Chart = styled.div<{ $mobile: boolean }>`
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

  /* There is plenty of horizontal room on desktop, so draw the bars wider
  (the default is 10px) to make them easier to read and click. */
  ${({ $mobile }) => ($mobile ? '' : '.ct-bar { stroke-width: 20px; }')}

  .ct-point-selected {
    stroke: var(--interactive-accent);
    stroke-width: 14px;
  }

  /* When a bucket is selected, the bars in the other buckets are faded out so
  the selected bucket stands out. The selected bars keep their own width and
  per-account colors so the accounts remain distinguishable. */
  .ct-bar-faded {
    opacity: 0.2;
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

      <Chart $mobile={Platform.isMobile}>{visualization}</Chart>
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

    if (props.selectedSegment && props.selectedSegment.index !== dpoint.index) {
      // Fade the bars of the buckets that are not selected so the selected
      // bucket stands out, while leaving the selected bars at their natural
      // width and per-account color.
      dpoint.element.addClass('ct-bar-faded');
    }

    if (props.selectedSegment?.index === dpoint.index) {
      // The value labels are only shown for the selected date, where one is
      // drawn for each account's bar so every account's contribution is
      // visible. The label is centered over the middle of its bar segment so
      // that, with the bars stacked, lower segments' labels are not hidden
      // behind the segment above them. A zero bar means there were no
      // transactions, so we leave it unlabeled.
      const value = dpoint.value.y;
      if (value !== 0) {
        const label = new Chartist.Svg(
          'text',
          {
            x: dpoint.x1,
            y: (dpoint.y1 + dpoint.y2) / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
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
