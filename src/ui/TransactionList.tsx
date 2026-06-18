import { LedgerModifier } from '../file-interface';
import {
  EnhancedExpenseLine,
  EnhancedTransaction,
  TransactionCache,
} from '../parser';
import { isRecurringInstance } from '../recurring';
import {
  filterByAccount,
  filterByEndDate,
  filterByStartDate,
  filterByTag,
  filterTransactions,
  getTotal,
  getVisibleTransactionTags,
  parseLedgerDate,
  RECURRING_TAG_FILTER,
} from '../transaction-utils';
import { DeleteIcon, EditIcon } from './ActionIcons';
import { ChartSegment } from './chartInteraction';
import { RecurringPill } from './Recurring';
import { TagFilter, TagPill } from './Tag';
import { Moment } from 'moment';
import React from 'react';
import {
  Column,
  Row,
  SortByFn,
  useFilters,
  useSortBy,
  useTable,
} from 'react-table';
import styled from 'styled-components';

/**
 * applyTagFilter narrows the transactions to the selected tag. The special
 * recurring filter value matches all transactions generated from a schedule.
 */
const applyTagFilter = (
  txs: EnhancedTransaction[],
  selectedTag: string | null,
): EnhancedTransaction[] => {
  if (!selectedTag) {
    return txs;
  }
  return filterTransactions(
    txs,
    selectedTag === RECURRING_TAG_FILTER
      ? isRecurringInstance
      : filterByTag(selectedTag),
  );
};

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
  <span className="ledger-row-actions">
    <button
      className="ledger-row-action"
      aria-label="Edit transaction"
      title="Edit"
      onClick={() => {
        updater.openExpenseModal('modify', tx);
      }}
    >
      <EditIcon />
    </button>
    <button
      className="ledger-row-action"
      aria-label="Delete transaction"
      title="Delete"
      onClick={() => updater.promptDeleteTransaction(tx)}
    >
      <DeleteIcon />
    </button>
  </span>
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
    filteredTransactions = applyTagFilter(
      filteredTransactions,
      props.selectedTag,
    );

    // Sort so most recent transactions come first. Transactions on the same
    // date keep their order in the file (a stable sort over the file-ordered
    // input), regardless of whether their dates use dashes or slashes.
    return [...filteredTransactions].sort((a, b) => {
      const aDate = parseLedgerDate(a.value.date);
      const bDate = parseLedgerDate(b.value.date);
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
  const tags = getVisibleTransactionTags(props.tx);

  return (
    <div className="mobile-tx-card">
      <div className="mobile-tx-row">
        <span className="mobile-tx-payee">
          <span className="mobile-tx-payee-name">{props.tx.value.payee}</span>
          {isRecurringInstance(props.tx) ? (
            <RecurringPill title="Generated from a recurring transaction" />
          ) : null}
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

  /* The edit/delete action buttons live in the last column. Their appearance is
   * shared with the recurring transactions list via global styles. */
  td:last-child {
    white-space: nowrap;
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
  recurring: boolean;
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
        tags: getVisibleTransactionTags(tx),
        recurring: isRecurringInstance(tx),
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
      tags: getVisibleTransactionTags(tx),
      recurring: isRecurringInstance(tx),
      total: getTotal(tx, currencySymbol),
      from: nonCommentLines[nonCommentLines.length - 1].account,
      to: <i>Multiple</i>,
      actions: makeActions(tx),
    };
  });

  // Sort so most recent transactions come first. Transactions on the same date
  // keep their order in the file (a stable sort over the file-ordered input),
  // regardless of whether their dates use dashes or slashes.
  tableRows.sort((a, b): number => {
    const aDate = parseLedgerDate(a.date);
    const bDate = parseLedgerDate(b.date);
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
    filteredTransactions = applyTagFilter(
      filteredTransactions,
      props.selectedTag,
    );
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
    filteredTransactions = applyTagFilter(
      filteredTransactions,
      props.selectedTag,
    );
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
    {row.recurring ? (
      <RecurringPill title="Generated from a recurring transaction" />
    ) : null}
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
        // Sort by the actual date value so dash (YYYY-MM-DD) and slash
        // (YYYY/MM/DD) dates for the same day compare equal, rather than by the
        // raw string (which would order all slash dates before/after all dash
        // dates and float recurring instances out of file order). Equal dates
        // fall through to the orderByFn tie-break below, preserving file order.
        sortType: (rowA: any, rowB: any, columnId: string): number => {
          const a = parseLedgerDate(rowA.values[columnId]);
          const b = parseLedgerDate(rowB.values[columnId]);
          if (a.isSame(b)) {
            return 0;
          }
          return a.isBefore(b) ? -1 : 1;
        },
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
  // Break ties on the original row order (which buildTableRows produced in file
  // order for same-date rows) regardless of sort direction. react-table's
  // default reverses ties for descending sorts, which would float the most
  // recently appended entries (e.g. recurring instances) to the top of their
  // day; this keeps same-date transactions in file order in either direction.
  const orderByFn = React.useCallback(
    (rows: Row<any>[], sortFns: SortByFn<any>[], dirs: boolean[]): Row<any>[] =>
      [...rows].sort((rowA, rowB) => {
        for (let i = 0; i < sortFns.length; i++) {
          // react-table invokes these wrapped sort functions with just the two
          // rows (the column id and direction are already baked in).
          const result = (sortFns[i] as (a: Row<any>, b: Row<any>) => number)(
            rowA,
            rowB,
          );
          if (result !== 0) {
            // A direction of `false` means descending, in which case react-table
            // negates the comparator result.
            return dirs[i] ? result : -result;
          }
        }
        return rowA.index - rowB.index;
      }),
    [],
  );

  const tableInstance = useTable(
    { columns, data, orderByFn },
    useFilters,
    useSortBy,
  );

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
