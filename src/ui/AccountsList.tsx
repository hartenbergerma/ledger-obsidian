import type { TransactionCache } from '../parser';
import {
  dealiasAccount,
  makeAccountTree,
  Node,
  sortAccountTree,
} from '../transaction-utils';
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
    `}
`;

const TreeRow = styled.div`
  margin-right: 10px;
  display: flex;
  align-items: stretch;

  .selected {
    background-color: var(--background-secondary);
  }
`;

const AccountName = styled.span`
  flex-grow: 1;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
  padding: 1px 6px;

  /*
  Prevent the account name text from being selected when dragging, which on
  mobile hijacks the touch gesture and breaks scrolling through the list.
  */
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;

  :hover {
    background-color: var(--background-primary-alt);
  }

  .ledger-account-balance {
    flex-shrink: 0;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
`;

const Expander = styled.span`
  flex-grow: 0;
  display: inline-block;
  width: 15px;
  user-select: none;
  -webkit-user-select: none;
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

const Tree: React.FC<{
  txCache: TransactionCache;
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

  const isBalanceType = (account: string): boolean =>
    props.txCache.assetAccounts.contains(account) ||
    props.txCache.liabilityAccounts.contains(account);
  const isFlowType = (account: string): boolean =>
    props.txCache.expenseAccounts.contains(account) ||
    props.txCache.incomeAccounts.contains(account);

  const id = props.data.id;
  const selected = props.selectedAccounts.contains(id);
  const balance = props.balances.get(id);
  const toggleSelected = (): void => {
    if (selected) {
      props.setSelectedAccounts(
        props.selectedAccounts.filter((account) => account !== id),
      );
      return;
    }

    // Make sure the selected accounts are all of the same type, which helps
    // ensure the visualization fits the account type. Accounts of an unknown
    // type may be combined with any other account.
    let newSelected = [...props.selectedAccounts, id];
    if (isBalanceType(id)) {
      newSelected = newSelected.filter((account) => !isFlowType(account));
    } else if (isFlowType(id)) {
      newSelected = newSelected.filter((account) => !isBalanceType(account));
    }
    props.setSelectedAccounts(newSelected);
  };

  return (
    <>
      <TreeRow style={{ paddingLeft: `${props.depth}rem` }}>
        {hasChildren ? (
          <Expander onClick={() => setExpanded(!expanded)}>
            {expanded ? '-' : '+'}
          </Expander>
        ) : (
          <Expander />
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
              txCache={props.txCache}
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

    // By default, the top level starts expanded
    nodes.forEach((node) => (node.expanded = true));
    return nodes;
  }, [props.txCache]);

  const balances = useCurrentBalances(props.dailyAccountBalanceMap);

  return (
    <ListContainer className="ledger-account-list" mobile={Platform.isMobile}>
      {data.map((root) => (
        <Tree
          txCache={props.txCache}
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
