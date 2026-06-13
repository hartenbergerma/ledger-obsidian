import { calcNetWorth } from '../balance-utils';
import type { TransactionCache } from '../parser';
import {
  dealiasAccount,
  makeAccountTree,
  Node,
  sortAccountTree,
} from '../transaction-utils';
import { union } from 'lodash';
import { Platform } from 'obsidian';
import React from 'react';
import styled, { css } from 'styled-components';

const ListContainer = styled.div<{ mobile: boolean }>`
  ${(props) =>
    props.mobile &&
    css`
      /* Larger tap targets so accounts are easier to select on mobile. */
      .ledger-account-name {
        padding-top: 10px;
        padding-bottom: 10px;
      }

      /*
      Make the expand/collapse control a large, visually distinct button so it
      is easy to tell apart from selecting the account itself.
      */
      .ledger-account-expander,
      .ledger-account-expander-spacer {
        width: 38px;
      }

      .ledger-account-expander {
        margin-right: 6px;
        font-size: 1.4em;
        border-radius: 4px;
        background-color: var(--background-secondary);
      }
    `}
`;

const TreeRow = styled.div`
  margin-right: 10px;
  display: flex;
  align-items: stretch;
`;

const AccountName = styled.span`
  flex-grow: 1;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;

  /*
  Prevent the account name text from being selected when dragging, which on
  mobile hijacks the touch gesture and breaks scrolling through the list.
  */
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;

  :hover {
    background-color: var(--background-modifier-hover);
  }

  /*
  Highlight the selected accounts prominently with the accent color so it is
  obvious which accounts are shown, on both desktop and mobile.
  */
  &.selected {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 600;
  }

  .ledger-account-balance {
    flex-shrink: 0;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  &.selected .ledger-account-balance {
    color: var(--text-on-accent);
    opacity: 0.85;
  }
`;

const Expander = styled.span`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  cursor: pointer;
  color: var(--text-muted);
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;

  :hover {
    color: var(--text-normal);
  }
`;

const ExpanderSpacer = styled.span`
  flex-shrink: 0;
  width: 15px;
`;

/**
 * useCurrentBalances aggregates the most recent balance for every account
 * (including the rolled-up balance of its sub-accounts) into a single lookup
 * keyed by the full dealiased account name.
 */
const useCurrentBalances = (
  dailyAccountBalanceMap: Map<string, Map<string, number>>,
): Map<string, number> =>
  React.useMemo(() => {
    const aggregated = new Map<string, number>();
    const dates = [...dailyAccountBalanceMap.keys()];
    if (dates.length === 0) {
      return aggregated;
    }

    const latest = dailyAccountBalanceMap.get(dates[dates.length - 1]);
    if (!latest) {
      return aggregated;
    }

    latest.forEach((balance, account) => {
      // Add this balance to the account and each of its parents so that parent
      // accounts display the total of their children.
      let prefix = '';
      account.split(':').forEach((segment) => {
        prefix = prefix ? `${prefix}:${segment}` : segment;
        aggregated.set(prefix, (aggregated.get(prefix) || 0) + balance);
      });
    });

    return aggregated;
  }, [dailyAccountBalanceMap]);

/**
 * useCurrentNetWorth computes the most recent net worth (the sum of all asset
 * and liability account balances). Returns undefined when there are no asset or
 * liability accounts to total.
 */
const useCurrentNetWorth = (
  dailyAccountBalanceMap: Map<string, Map<string, number>>,
  txCache: TransactionCache,
): number | undefined =>
  React.useMemo(() => {
    const netWorthAccounts = new Set(
      union(txCache.assetAccounts, txCache.liabilityAccounts),
    );
    if (netWorthAccounts.size === 0) {
      return undefined;
    }

    const dates = [...dailyAccountBalanceMap.keys()];
    const latest =
      dates.length > 0
        ? dailyAccountBalanceMap.get(dates[dates.length - 1])
        : undefined;
    if (!latest) {
      return undefined;
    }

    return calcNetWorth(latest, netWorthAccounts);
  }, [dailyAccountBalanceMap, txCache]);

const Tree: React.FC<{
  data: Node;
  depth: number;
  selectedAccounts: string[];
  setSelectedAccounts: React.Dispatch<React.SetStateAction<string[]>>;
  balances: Map<string, number>;
  currencySymbol: string;
}> = (props): JSX.Element => {
  const [expanded, setExpanded] = React.useState(props.data.expanded || false);
  const subRows = props.data.subRows;
  const hasChildren = subRows !== undefined && subRows.length > 0;

  const id = props.data.id;
  const selected = props.selectedAccounts.contains(id);
  const balance = props.balances.get(id);

  // Selecting an account simply toggles it. Any combination of accounts may be
  // selected, including across different categories.
  const toggleSelected = (): void => {
    props.setSelectedAccounts(
      selected
        ? props.selectedAccounts.filter((account) => account !== id)
        : [...props.selectedAccounts, id],
    );
  };

  return (
    <>
      <TreeRow style={{ paddingLeft: `${props.depth}rem` }}>
        {hasChildren ? (
          <Expander
            className="ledger-account-expander"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '−' : '+'}
          </Expander>
        ) : (
          <ExpanderSpacer className="ledger-account-expander-spacer" />
        )}
        <AccountName
          className={`ledger-account-name${selected ? ' selected' : ''}`}
          onClick={toggleSelected}
        >
          <span>{props.data.account}</span>
          {balance !== undefined ? (
            <span className="ledger-account-balance">
              {props.currencySymbol}
              {balance.toFixed(2)}
            </span>
          ) : null}
        </AccountName>
      </TreeRow>
      {hasChildren && expanded && subRows
        ? subRows.map((child) => (
            <Tree
              data={child}
              key={child.id}
              depth={props.depth + 1}
              selectedAccounts={props.selectedAccounts}
              setSelectedAccounts={props.setSelectedAccounts}
              balances={props.balances}
              currencySymbol={props.currencySymbol}
            />
          ))
        : null}
    </>
  );
};

export const AccountsList: React.FC<{
  txCache: TransactionCache;
  selectedAccounts: string[];
  setSelectedAccounts: React.Dispatch<React.SetStateAction<string[]>>;
  dailyAccountBalanceMap: Map<string, Map<string, number>>;
  currencySymbol: string;
}> = (props): JSX.Element => {
  const data = React.useMemo(() => {
    const nodes: Node[] = [];
    props.txCache.accounts.forEach((account: string) => {
      makeAccountTree(nodes, dealiasAccount(account, props.txCache.aliases));
    });
    sortAccountTree(nodes);

    // The top level starts expanded on desktop, but everything starts collapsed
    // on mobile to keep the initially visible list short.
    if (!Platform.isMobile) {
      nodes.forEach((node) => (node.expanded = true));
    }
    return nodes;
  }, [props.txCache]);

  const balances = useCurrentBalances(props.dailyAccountBalanceMap);
  const netWorth = useCurrentNetWorth(
    props.dailyAccountBalanceMap,
    props.txCache,
  );
  const showingNetWorth = props.selectedAccounts.length === 0;

  return (
    <ListContainer className="ledger-account-list" mobile={Platform.isMobile}>
      <TreeRow>
        <ExpanderSpacer className="ledger-account-expander-spacer" />
        <AccountName
          className={`ledger-account-name${showingNetWorth ? ' selected' : ''}`}
          onClick={() => props.setSelectedAccounts([])}
          title="Show net worth (clears the account selection)"
        >
          <span>Net Worth</span>
          {netWorth !== undefined ? (
            <span className="ledger-account-balance">
              {props.currencySymbol}
              {netWorth.toFixed(2)}
            </span>
          ) : null}
        </AccountName>
      </TreeRow>
      {data.map((root) => (
        <Tree
          data={root}
          key={root.id}
          depth={0}
          selectedAccounts={props.selectedAccounts}
          setSelectedAccounts={props.setSelectedAccounts}
          balances={balances}
          currencySymbol={props.currencySymbol}
        />
      ))}
    </ListContainer>
  );
};
