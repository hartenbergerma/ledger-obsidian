import {
  makeDailyAccountBalanceChangeMap,
  makeDailyBalanceMap,
} from '../balance-utils';
import { DateRange, Interval, resolveDateRange } from '../date-utils';
import { LedgerModifier } from '../file-interface';
import type { TransactionCache } from '../parser';
import { ISettings } from '../settings';
import { AccountsList } from './AccountsList';
import { AccountVisualization } from './AccountVisualization';
import { ChartSegment } from './chartInteraction';
import { DateRangeSelector } from './DateRangeSelector';
import { NetWorthVisualization } from './NetWorthVisualization';
import { ParseErrors } from './ParseErrors';
import {
  FlexContainer,
  FlexFloatRight,
  FlexMainContent,
  FlexShrink,
} from './SharedStyles';
import {
  MobileTransactionList,
  RecentTransactionList,
  TransactionList,
} from './TransactionList';
import { Step, Steps } from 'intro.js-react';
import { Moment } from 'moment';
import { Platform } from 'obsidian';
import React from 'react';
import styled from 'styled-components';

const FlexSidebar = styled(FlexShrink)`
  flex-basis: 20%;
`;

export const LedgerDashboard: React.FC<{
  tutorialIndex: number;
  setTutorialIndex: (index: number) => void;
  settings: ISettings;
  txCache: TransactionCache;
  updater: LedgerModifier;
}> = (props): JSX.Element => {
  const [tutorialIndex, setTutorialIndex] = React.useState(props.tutorialIndex);
  const setTutorialIndexWrapper = (index: number): void => {
    setTutorialIndex(index); // This updates the current state
    props.setTutorialIndex(index); // This updates the saved state
  };

  if (!props.txCache) {
    return <p>Loading...</p>;
  }

  return Platform.isMobile ? (
    <MobileDashboard
      settings={props.settings}
      txCache={props.txCache}
      updater={props.updater}
    />
  ) : (
    <DesktopDashboard
      tutorialIndex={tutorialIndex}
      setTutorialIndex={setTutorialIndexWrapper}
      settings={props.settings}
      txCache={props.txCache}
      updater={props.updater}
    />
  );
};

const Header: React.FC<{}> = (props): JSX.Element => (
  <div>
    <FlexContainer>
      <FlexSidebar>
        <h2>Ledger</h2>
      </FlexSidebar>
      <FlexFloatRight>{props.children}</FlexFloatRight>
    </FlexContainer>
  </div>
);

const useDailyAccountBalanceMap = (
  txCache: TransactionCache,
): Map<string, Map<string, number>> =>
  React.useMemo(() => {
    console.time('daily-balance-map');

    const changeMap = makeDailyAccountBalanceChangeMap(txCache.transactions);
    const balanceMap = makeDailyBalanceMap(
      txCache.accounts,
      changeMap,
      txCache.firstDate,
      window.moment(),
    );

    console.timeLog('daily-balance-map');
    console.timeEnd('daily-balance-map');

    return balanceMap;
  }, [txCache]);

const useDateRange = (
  txCache: TransactionCache,
  initialRange: DateRange,
): {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  startDate: Moment;
  endDate: Moment;
  interval: Interval;
} => {
  const [dateRange, setDateRange] = React.useState<DateRange>(initialRange);
  const { startDate, endDate, interval } = React.useMemo(
    () => resolveDateRange(dateRange, txCache.firstDate),
    [dateRange, txCache],
  );
  return { dateRange, setDateRange, startDate, endDate, interval };
};

const MobileStyles = styled.div`
  padding-bottom: 48px;

  .ledger-mobile-account-toggle {
    width: 100%;
    text-align: left;
    margin: 8px 0;
  }
`;

const MobileDashboard: React.FC<{
  settings: ISettings;
  txCache: TransactionCache;
  updater: LedgerModifier;
}> = (props): JSX.Element => {
  const dailyAccountBalanceMap = useDailyAccountBalanceMap(props.txCache);
  const { dateRange, setDateRange, startDate, endDate, interval } =
    useDateRange(props.txCache, 'month');
  const [selectedAccounts, setSelectedAccounts] = React.useState<string[]>([]);
  const [accountsExpanded, setAccountsExpanded] = React.useState(false);
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
  const toggleTag = (tag: string): void =>
    setSelectedTag((prev) => (prev === tag ? null : tag));
  const [selectedSegment, setSelectedSegment] =
    React.useState<ChartSegment | null>(null);

  // A selected chart segment refers to a specific point/bar, so it stops being
  // meaningful once the date range or the set of accounts changes.
  React.useEffect(() => {
    setSelectedSegment(null);
  }, [dateRange, selectedAccounts]);

  // Clear the tag filter if the selected tag no longer exists (e.g. the last
  // transaction with that tag was deleted or had its tag changed).
  React.useEffect(() => {
    if (selectedTag && !props.txCache.tags.includes(selectedTag)) {
      setSelectedTag(null);
    }
  }, [props.txCache.tags, selectedTag]);

  return (
    <MobileStyles>
      <DateRangeSelector
        range={dateRange}
        setRange={setDateRange}
        firstDate={props.txCache.firstDate}
      />

      <button
        className="ledger-mobile-account-toggle"
        onClick={() => setAccountsExpanded(!accountsExpanded)}
      >
        {accountsExpanded ? '▾' : '▸'} Filter by account
        {selectedAccounts.length > 0
          ? ` (${selectedAccounts.length} selected)`
          : ''}
      </button>
      {accountsExpanded ? (
        <AccountsList
          txCache={props.txCache}
          selectedAccounts={selectedAccounts}
          setSelectedAccounts={setSelectedAccounts}
          dailyAccountBalanceMap={dailyAccountBalanceMap}
          currencySymbol={props.settings.currencySymbol}
        />
      ) : null}

      {props.txCache.parsingErrors.length > 0 ? (
        <ParseErrors txCache={props.txCache} />
      ) : null}

      {selectedAccounts.length === 0 ? (
        <NetWorthVisualization
          dailyAccountBalanceMap={dailyAccountBalanceMap}
          startDate={startDate}
          endDate={endDate}
          interval={interval}
          txCache={props.txCache}
          currencySymbol={props.settings.currencySymbol}
          selectedSegment={selectedSegment}
          setSelectedSegment={setSelectedSegment}
        />
      ) : (
        <AccountVisualization
          dailyAccountBalanceMap={dailyAccountBalanceMap}
          allAccounts={props.txCache.accounts}
          selectedAccounts={selectedAccounts}
          startDate={startDate}
          endDate={endDate}
          interval={interval}
          currencySymbol={props.settings.currencySymbol}
          selectedSegment={selectedSegment}
          setSelectedSegment={setSelectedSegment}
        />
      )}

      <h2>Transactions</h2>
      <MobileTransactionList
        currencySymbol={props.settings.currencySymbol}
        txCache={props.txCache}
        updater={props.updater}
        selectedAccounts={selectedAccounts}
        selectedTag={selectedTag}
        onToggleTag={toggleTag}
        startDate={startDate}
        endDate={endDate}
        segment={selectedSegment}
        onClearSegment={() => setSelectedSegment(null)}
      />
    </MobileStyles>
  );
};

const DesktopDashboard: React.FC<{
  tutorialIndex: number;
  setTutorialIndex: (index: number) => void;
  settings: ISettings;
  txCache: TransactionCache;
  updater: LedgerModifier;
}> = (props): JSX.Element => {
  const dailyAccountBalanceMap = useDailyAccountBalanceMap(props.txCache);
  const { dateRange, setDateRange, startDate, endDate, interval } =
    useDateRange(props.txCache, 'month');
  const [selectedAccounts, setSelectedAccounts] = React.useState<string[]>([]);
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
  const toggleTag = (tag: string): void =>
    setSelectedTag((prev) => (prev === tag ? null : tag));
  const [selectedSegment, setSelectedSegment] =
    React.useState<ChartSegment | null>(null);

  // A selected chart segment refers to a specific point/bar, so it stops being
  // meaningful once the date range or the set of accounts changes.
  React.useEffect(() => {
    setSelectedSegment(null);
  }, [dateRange, selectedAccounts]);

  // Clear the tag filter if the selected tag no longer exists (e.g. the last
  // transaction with that tag was deleted or had its tag changed).
  React.useEffect(() => {
    if (selectedTag && !props.txCache.tags.includes(selectedTag)) {
      setSelectedTag(null);
    }
  }, [props.txCache.tags, selectedTag]);

  return (
    <>
      <Header>
        <DateRangeSelector
          range={dateRange}
          setRange={setDateRange}
          firstDate={props.txCache.firstDate}
        />
        {props.tutorialIndex !== -1 ? (
          <Tutorial
            tutorialIndex={props.tutorialIndex}
            setTutorialIndex={props.setTutorialIndex}
          />
        ) : null}
      </Header>

      <FlexContainer>
        <FlexSidebar>
          <AccountsList
            txCache={props.txCache}
            selectedAccounts={selectedAccounts}
            setSelectedAccounts={setSelectedAccounts}
            dailyAccountBalanceMap={dailyAccountBalanceMap}
            currencySymbol={props.settings.currencySymbol}
          />
        </FlexSidebar>
        <FlexMainContent>
          {props.txCache.parsingErrors.length > 0 ? (
            <ParseErrors txCache={props.txCache} />
          ) : null}
          {selectedAccounts.length === 0 ? (
            <>
              <NetWorthVisualization
                dailyAccountBalanceMap={dailyAccountBalanceMap}
                startDate={startDate}
                endDate={endDate}
                interval={interval}
                txCache={props.txCache}
                currencySymbol={props.settings.currencySymbol}
                selectedSegment={selectedSegment}
                setSelectedSegment={setSelectedSegment}
              />
              <RecentTransactionList
                currencySymbol={props.settings.currencySymbol}
                txCache={props.txCache}
                updater={props.updater}
                selectedTag={selectedTag}
                onToggleTag={toggleTag}
                startDate={startDate}
                endDate={endDate}
                segment={selectedSegment}
                onClearSegment={() => setSelectedSegment(null)}
              />
            </>
          ) : (
            <>
              <AccountVisualization
                dailyAccountBalanceMap={dailyAccountBalanceMap}
                allAccounts={props.txCache.accounts}
                selectedAccounts={selectedAccounts}
                startDate={startDate}
                endDate={endDate}
                interval={interval}
                currencySymbol={props.settings.currencySymbol}
                selectedSegment={selectedSegment}
                setSelectedSegment={setSelectedSegment}
              />
              <TransactionList
                currencySymbol={props.settings.currencySymbol}
                txCache={props.txCache}
                updater={props.updater}
                selectedAccounts={selectedAccounts}
                setSelectedAccount={(account: string) =>
                  setSelectedAccounts([account])
                }
                selectedTag={selectedTag}
                onToggleTag={toggleTag}
                startDate={startDate}
                endDate={endDate}
                segment={selectedSegment}
                onClearSegment={() => setSelectedSegment(null)}
              />
            </>
          )}
        </FlexMainContent>
      </FlexContainer>
    </>
  );
};

const Tutorial: React.FC<{
  tutorialIndex: number;
  setTutorialIndex: (index: number) => void;
}> = (props): JSX.Element => {
  const steps: Step[] = [
    {
      intro:
        'Welcome to the Obsidian Ledger plugin. Let me show you around a bit!',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: 'Click on account names to view their transactions and balance.',
      element: '.ledger-account-list',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro:
        'Choose the time period to display. The graph resolution adjusts automatically.',
      element: '.ledger-daterange-selectors',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: 'Click here to edit your Ledger file as raw text.',
      element: 'a[aria-label="Switch to Markdown View"]',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro:
        'There are more helpful tips in your Ledger file. Go take a look at it in raw text mode.',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: (
        <p>
          If you have any questions, please visit the{' '}
          <a href="https://github.com/tgrosinger/ledger-obsidian/discussions">
            Github Discussions Page
          </a>
          .
        </p>
      ),
      tooltipClass: 'ledger-tutorial-tooltip',
    },
  ];

  const onExit = (index: number): void => {
    if (index + 1 >= steps.length) {
      props.setTutorialIndex(-1);
    } else {
      props.setTutorialIndex(index);
    }
  };

  return (
    <Steps
      enabled={true}
      steps={steps}
      onExit={onExit}
      initialStep={Math.min(props.tutorialIndex, steps.length - 1)}
    />
  );
};
