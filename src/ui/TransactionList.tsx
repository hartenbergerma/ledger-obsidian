import { LedgerModifier } from '../file-interface';
import {
  EnhancedExpenseLine,
  EnhancedTransaction,
  TransactionCache,
} from '../parser';
import {
  filterByAccount,
  filterByEndDate,
  filterByStartDate,
  filterByTag,
  filterTransactions,
  getTotal,
  getTransactionTags,
} from '../transaction-utils';
import { ChartSegment } from './chartInteraction';
import { TagFilter, TagPill } from './Tag';
import { Moment } from 'moment';
import React from 'react';
import { Column, useFilters, useSortBy, useTable } from 'react-table';
import styled from 'styled-components';

/**
 * SegmentBanner shows which chart segment the transaction list is currently
 * filtered to, along with a button to clear the selection and return to the
 * full date range.
 */
const SegmentBannerStyle = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;

  button {
    flex-shrink: 0;
  }
`;

const SegmentBanner: React.FC<{
  segment: ChartSegment;
  onClear: () => void;
}> = ({ segment, onClear }): JSX.Element => (
  <SegmentBannerStyle>
    <span>
      Showing transactions for <strong>{segment.label}</strong>
    </span>
    <button onClick={onClear}>Clear selection</button>
  </SegmentBannerStyle>
);

/**
 * TransactionActions renders the edit and delete buttons for a transaction.
 * The styling of the icons is left to the parent component.
 */
const TransactionActions: React.FC<{
  tx: EnhancedTransaction;
  updater: LedgerModifier;
}> = ({ tx, updater }): JSX.Element => (
  <>
    <svg
      onClick={() => {
        updater.openExpenseModal('modify', tx);
      }}
      width="16"
      height="16"
      version="1.1"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        transform="scale(5.5556)"
        d="m15.533 0.63086c-0.474 0-0.94594 0.18813-1.3047 0.54688l-0.35156 0.35156 2.5938 2.5938 0.35156-0.35156c0.71861-0.71861 0.71861-1.8927 0-2.6113h-2e-3v-0.00195c-0.35848-0.33966-0.83006-0.52735-1.2871-0.52735zm-2.0957 1.457-0.0098 0.00195c-0.10358 0.020715-0.19358 0.06467-0.26172 0.13281l-11.668 11.67c-0.073201 0.0488-0.12225 0.12572-0.14453 0.21484l-0.7207 2.6973c-0.044708 0.15648 0.002068 0.32043 0.11328 0.43164 0.11121 0.11121 0.27321 0.15604 0.42969 0.11133l2.7012-0.71875 0.00391-2e-3c0.071076-0.02369 0.13619-0.06783 0.19727-0.12891l11.682-11.682c0.17582-0.17582 0.17582-0.45699 0-0.63281-0.17582-0.17582-0.45504-0.17582-0.63086 0l-11.547 11.564-1.3301-1.3301 11.564-11.564c0.1309-0.1309 0.17558-0.33127 0.08594-0.49609-0.07115-0.17891-0.24833-0.26953-0.41992-0.26953z"
      />
    </svg>
    <svg
      onClick={() => updater.promptDeleteTransaction(tx)}
      width="16"
      height="16"
      version="1.1"
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m6.6465 5.2324-1.4141 1.4141 7.3535 7.3535-7.3535 7.3535 1.4141 1.4141 7.3535-7.3535 7.3535 7.3535 1.4141-1.4141-7.3535-7.3535 7.3535-7.3535-1.4141-1.4141-7.3535 7.3535-7.3535-7.3535z" />
    </svg>
  </>
);

const MobileTxListStyle = styled.div`
  .mobile-tx-card {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }

  .mobile-tx-row {
    display: flex;
    align-items: baseline;
  }

  .mobile-tx-payee {
    flex-grow: 1;
    font-weight: bold;
    overflow-wrap: anywhere;
  }

  /* Space between the payee name and its tag pill. */
  .mobile-tx-payee-name {
    margin-right: 8px;
  }

  .mobile-tx-total {
    flex-shrink: 0;
    margin-left: 8px;
  }

  .mobile-tx-details {
    color: var(--text-muted);
    font-size: 0.85em;
    margin-top: 4px;
    align-items: center;
  }

  .mobile-tx-accounts {
    flex-grow: 1;
    overflow-wrap: anywhere;
  }

  .mobile-tx-actions {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .mobile-tx-actions svg {
    margin-left: 16px;
    fill: var(--text-muted);
    cursor: pointer;
  }

  .mobile-tx-more {
    width: 100%;
  }
`;

export const MobileTransactionList: React.FC<{
  currencySymbol: string;
  txCache: TransactionCache;
  updater: LedgerModifier;
  selectedAccounts: string[];
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
  startDate: Moment;
  endDate: Moment;
  segment?: ChartSegment | null;
  onClearSegment?: () => void;
}> = (props): JSX.Element => {
  const pageSize = 20;
  const [visibleCount, setVisibleCount] = React.useState(pageSize);

  const start = props.segment ? props.segment.filterStart : props.startDate;
  const end = props.segment ? props.segment.filterEnd : props.endDate;

  const transactions = React.useMemo(() => {
    let filteredTransactions = filterTransactions(
      props.txCache.transactions,
      ...props.selectedAccounts.map((a) => filterByAccount(a)),
    );
    filteredTransactions = filterTransactions(
      filteredTransactions,
      filterByStartDate(start),
    );
    filteredTransactions = filterTransactions(
      filteredTransactions,
      filterByEndDate(end),
    );
    if (props.selectedTag) {
      filteredTransactions = filterTransactions(
        filteredTransactions,
        filterByTag(props.selectedTag),
      );
    }

    // Sort so most recent transactions come first
    return [...filteredTransactions].sort((a, b) => {
      const aDate = window.moment(a.value.date);
      const bDate = window.moment(b.value.date);
      if (aDate.isSame(bDate)) {
        return 0;
      }
      return aDate.isBefore(bDate) ? 1 : -1;
    });
  }, [props.txCache, props.selectedAccounts, props.selectedTag, start, end]);

  const banner =
    props.segment && props.onClearSegment ? (
      <SegmentBanner segment={props.segment} onClear={props.onClearSegment} />
    ) : null;

  const tagFilter = (
    <TagFilter
      allTags={props.txCache.tags}
      selectedTag={props.selectedTag}
      onToggleTag={props.onToggleTag}
    />
  );

  if (transactions.length === 0) {
    return (
      <>
        {banner}
        {tagFilter}
        <p>No transactions for the selected time period.</p>
      </>
    );
  }

  return (
    <MobileTxListStyle>
      {banner}
      {tagFilter}
      {transactions.slice(0, visibleCount).map((tx) => (
        <MobileTransactionEntry
          key={`${tx.block.firstLine}-${tx.value.date}-${tx.value.payee}`}
          tx={tx}
          currencySymbol={props.currencySymbol}
          updater={props.updater}
          onSelectTag={props.onToggleTag}
        />
      ))}
      {transactions.length > visibleCount ? (
        <button
          className="mobile-tx-more"
          onClick={() => setVisibleCount(visibleCount + pageSize)}
        >
          Show more
        </button>
      ) : null}
    </MobileTxListStyle>
  );
};

export const MobileTransactionEntry: React.FC<{
  tx: EnhancedTransaction;
  currencySymbol: string;
  updater: LedgerModifier;
  onSelectTag?: (tag: string) => void;
}> = (props): JSX.Element => {
  const nonCommentLines = props.tx.value.expenselines.filter(
    (line): line is EnhancedExpenseLine => 'account' in line,
  );
  const from =
    nonCommentLines.length > 0
      ? nonCommentLines[nonCommentLines.length - 1].account
      : '';
  const to =
    nonCommentLines.length === 2 ? nonCommentLines[0].account : 'Multiple';
  const tags = getTransactionTags(props.tx);

  return (
    <div className="mobile-tx-card">
      <div className="mobile-tx-row">
        <span className="mobile-tx-payee">
          <span className="mobile-tx-payee-name">{props.tx.value.payee}</span>
          {tags.map((tag) => (
            <TagPill
              key={tag}
              tag={tag}
              onClick={
                props.onSelectTag ? () => props.onSelectTag?.(tag) : undefined
              }
            />
          ))}
        </span>
        <span className="mobile-tx-total">
          {getTotal(props.tx, props.currencySymbol)}
        </span>
      </div>
      <div className="mobile-tx-row mobile-tx-details">
        <span className="mobile-tx-accounts">
          {props.tx.value.date} · {from} ➜ {to}
        </span>
        <span className="mobile-tx-actions">
          <TransactionActions tx={props.tx} updater={props.updater} />
        </span>
      </div>
    </div>
  );
};

const TableStyles = styled.div`
  padding-right: 1rem;

  table {
    width: 100%;
    border-spacing: 0;
    border: 1px solid var(--background-modifier-border);

    tr {
      :last-child {
        td {
          border-bottom: 0;
        }
      }
      :hover {
        background: var(--background-secondary);
      }
    }

    th {
      text-align: left;
      background: var(--background-primary-alt);
    }

    th,
    td {
      margin: 0;
      padding: 0.5rem;
      border-bottom: 1px solid var(--background-modifier-border);
    }
  }

  /* These rules style the edit/delete action icons, which live in the last
   * column. They are scoped to that column so they do not affect the tag icon
   * rendered in the payee column. */
  tr:hover td:last-child svg {
    fill: var(--text-muted);
  }

  td:last-child svg {
    margin-left: 10px;
    cursor: pointer;
    fill: none;
    stroke: none;
  }

  .ledger-tx-more {
    width: 100%;
    margin-top: 8px;
  }

  .ledger-tx-payee-cell {
    display: inline-flex;
    flex-wrap: wrap;
    /* Vertically center the tag pill against the payee text. */
    align-items: center;
  }

  .ledger-tx-payee-name {
    margin-right: 8px;
  }
`;

interface TableRow {
  date: string;
  payee: string;
  tags: string[];
  total: string;
  from: string;
  to: string | JSX.Element;
  actions: JSX.Element;
}

const buildTableRows = (
  transactions: EnhancedTransaction[],
  currencySymbol: string,
  updater: LedgerModifier,
): TableRow[] => {
  const makeActions = (tx: EnhancedTransaction): JSX.Element => (
    <TransactionActions tx={tx} updater={updater} />
  );

  const tableRows = transactions.map((tx: EnhancedTransaction): TableRow => {
    const nonCommentLines = tx.value.expenselines.filter(
      (line): line is EnhancedExpenseLine => 'account' in line,
    );

    if (nonCommentLines.length < 2) {
      // This should not make it past the parser, but this is necessary for type checking.
      throw new Error(
        'Unexpected transaction with fewer than two account lines',
      );
    }

    if (nonCommentLines.length === 2) {
      // If there are only two lines, then this is a simple 'from->to' transaction
      return {
        date: tx.value.date,
        payee: tx.value.payee,
        tags: getTransactionTags(tx),
        total: getTotal(tx, currencySymbol),
        from: nonCommentLines[1].account,
        to: nonCommentLines[0].account,
        actions: makeActions(tx),
      };
    }
    // Otherwise, there are multiple 'to' lines to consider
    return {
      date: tx.value.date,
      payee: tx.value.payee,
      tags: getTransactionTags(tx),
      total: getTotal(tx, currencySymbol),
      from: nonCommentLines[nonCommentLines.length - 1].account,
      to: <i>Multiple</i>,
      actions: makeActions(tx),
    };
  });

  // Sort so most recent transactions come first
  tableRows.sort((a, b): number => {
    const aDate = window.moment(a.date);
    const bDate = window.moment(b.date);
    if (aDate.isSame(bDate)) {
      return 0;
    }
    return aDate.isBefore(bDate) ? 1 : -1;
  });

  return tableRows;
};

// TODO: Clicking in a transaction should open it in the transaction modal and allow editing.

export const RecentTransactionList: React.FC<{
  currencySymbol: string;
  txCache: TransactionCache;
  updater: LedgerModifier;
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
  startDate: Moment;
  endDate: Moment;
  segment?: ChartSegment | null;
  onClearSegment?: () => void;
}> = (props): JSX.Element => {
  const start = props.segment ? props.segment.filterStart : props.startDate;
  const end = props.segment ? props.segment.filterEnd : props.endDate;
  const data = React.useMemo(() => {
    let filteredTransactions = filterTransactions(
      props.txCache.transactions,
      filterByStartDate(start),
    );
    filteredTransactions = filterTransactions(
      filteredTransactions,
      filterByEndDate(end),
    );
    if (props.selectedTag) {
      filteredTransactions = filterTransactions(
        filteredTransactions,
        filterByTag(props.selectedTag),
      );
    }
    return buildTableRows(
      filteredTransactions,
      props.currencySymbol,
      props.updater,
    );
  }, [props.txCache, props.selectedTag, start, end, props.segment]);
  return (
    <>
      <h2>Transactions</h2>
      {props.segment && props.onClearSegment ? (
        <SegmentBanner segment={props.segment} onClear={props.onClearSegment} />
      ) : null}
      <TagFilter
        allTags={props.txCache.tags}
        selectedTag={props.selectedTag}
        onToggleTag={props.onToggleTag}
      />
      <TransactionTable data={data} onSelectTag={props.onToggleTag} />
    </>
  );
};

export const TransactionList: React.FC<{
  currencySymbol: string;
  txCache: TransactionCache;
  updater: LedgerModifier;
  selectedAccounts: string[];
  setSelectedAccount: (accountName: string) => void;
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
  startDate: Moment;
  endDate: Moment;
  segment?: ChartSegment | null;
  onClearSegment?: () => void;
}> = (props): JSX.Element => {
  const start = props.segment ? props.segment.filterStart : props.startDate;
  const end = props.segment ? props.segment.filterEnd : props.endDate;
  const data = React.useMemo(() => {
    // Filters are applied sequentially when they need to be and-ed together.
    // This might not be the most efficient solution...
    let filteredTransactions = filterTransactions(
      props.txCache.transactions,
      ...props.selectedAccounts.map((a) => filterByAccount(a)),
    );
    filteredTransactions = filterTransactions(
      filteredTransactions,
      filterByStartDate(start),
    );
    filteredTransactions = filterTransactions(
      filteredTransactions,
      filterByEndDate(end),
    );
    if (props.selectedTag) {
      filteredTransactions = filterTransactions(
        filteredTransactions,
        filterByTag(props.selectedTag),
      );
    }
    return buildTableRows(
      filteredTransactions,
      props.currencySymbol,
      props.updater,
    );
  }, [props.txCache, props.selectedAccounts, props.selectedTag, start, end]);

  return (
    <>
      {props.segment && props.onClearSegment ? (
        <SegmentBanner segment={props.segment} onClear={props.onClearSegment} />
      ) : null}
      <TagFilter
        allTags={props.txCache.tags}
        selectedTag={props.selectedTag}
        onToggleTag={props.onToggleTag}
      />
      <TransactionTable data={data} onSelectTag={props.onToggleTag} />
    </>
  );
};

const PayeeCell: React.FC<{
  row: TableRow;
  onSelectTag?: (tag: string) => void;
}> = ({ row, onSelectTag }): JSX.Element => (
  <span className="ledger-tx-payee-cell">
    <span className="ledger-tx-payee-name">{row.payee}</span>
    {row.tags.map((tag) => (
      <TagPill
        key={tag}
        tag={tag}
        onClick={onSelectTag ? () => onSelectTag(tag) : undefined}
      />
    ))}
  </span>
);

const TransactionTable: React.FC<{
  data: TableRow[];
  onSelectTag?: (tag: string) => void;
}> = ({ data, onSelectTag }): JSX.Element => {
  const pageSize = 20;
  const [visibleCount, setVisibleCount] = React.useState(pageSize);

  // Reset back to the first page whenever the underlying data changes (e.g. a
  // different date range or chart segment is selected).
  React.useEffect(() => {
    setVisibleCount(pageSize);
  }, [data]);

  const columns = React.useMemo<Column[]>(
    () => [
      {
        Header: 'Date',
        accessor: 'date',
      },
      {
        Header: 'Payee',
        accessor: 'payee',
        // Sorting still uses the plain payee string, but the cell also renders
        // the transaction's tag(s) next to the payee name.
        Cell: ({ row }: { row: { original: TableRow } }) => (
          <PayeeCell row={row.original} onSelectTag={onSelectTag} />
        ),
      },
      {
        Header: 'Total',
        accessor: 'total',
      },
      {
        Header: 'From Account',
        accessor: 'from',
      },
      {
        Header: 'To Account',
        accessor: 'to',
      },
      {
        Header: '',
        accessor: 'actions',
      },
    ],
    [onSelectTag],
  );
  const tableInstance = useTable({ columns, data }, useFilters, useSortBy);

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    tableInstance;

  if (data.length === 0) {
    // TODO: Style and center this
    return <p>No transactions for the selected time period.</p>;
  }

  return (
    <TableStyles>
      <table {...getTableProps()}>
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((column) => (
                <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                  {column.render('Header')}
                  <span>
                    {column.isSorted ? (column.isSortedDesc ? ' ↑' : ' ↓') : ''}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.slice(0, visibleCount).map((row) => {
            prepareRow(row);
            return (
              <tr {...row.getRowProps()}>
                {row.cells.map((cell) => (
                  <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > visibleCount ? (
        <button
          className="ledger-tx-more"
          onClick={() => setVisibleCount(visibleCount + pageSize)}
        >
          Load more
        </button>
      ) : null}
    </TableStyles>
  );
};
