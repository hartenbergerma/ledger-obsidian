import { LedgerModifier } from '../file-interface';
import type { EnhancedExpenseLine, TransactionCache } from '../parser';
import {
  effectiveDueDate,
  isDue,
  materializeTransaction,
  RecurringTransaction,
} from '../recurring';
import { ISettings } from '../settings';
import { getTotal } from '../transaction-utils';
import { RecurringIcon, summarizeRecurrence } from './Recurring';
import React from 'react';
import styled from 'styled-components';

const summarize = (rt: RecurringTransaction): string =>
  summarizeRecurrence({
    enabled: true,
    intervalCount: rt.intervalCount,
    unit: rt.unit,
    weekday: rt.weekday ?? 1,
    dayOfMonth: rt.dayOfMonth ?? 1,
    adjustToWorkday: rt.adjustToWorkday,
  });

/**
 * accountsFor returns the from/to account summary for a recurring transaction,
 * matching the convention used in the transaction list (last line is "from").
 */
const accountsFor = (
  rt: RecurringTransaction,
): { from: string; to: string } => {
  const accountLines = rt.expenselines.filter(
    (line): line is EnhancedExpenseLine => 'account' in line,
  );
  if (accountLines.length === 0) {
    return { from: '', to: '' };
  }
  const from = accountLines[accountLines.length - 1].account;
  const to = accountLines.length === 2 ? accountLines[0].account : 'Multiple';
  return { from, to };
};

const EditIcon: React.FC = (): JSX.Element => (
  <svg
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
);

const RemoveIcon: React.FC = (): JSX.Element => (
  <svg
    width="16"
    height="16"
    version="1.1"
    viewBox="0 0 28 28"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="m6.6465 5.2324-1.4141 1.4141 7.3535 7.3535-7.3535 7.3535 1.4141 1.4141 7.3535-7.3535 7.3535 7.3535 1.4141-1.4141-7.3535-7.3535 7.3535-7.3535-1.4141-1.4141-7.3535 7.3535-7.3535-7.3535z" />
  </svg>
);

const RecurringStyles = styled.div`
  margin-top: 24px;

  .ledger-recurring-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ledger-recurring-heading .ledger-recurring-icon {
    stroke: var(--text-muted);
  }

  table {
    width: 100%;
    border-spacing: 0;
    border: 1px solid var(--background-modifier-border);
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

  tr:last-child td {
    border-bottom: 0;
  }

  tr:hover {
    background: var(--background-secondary);
  }

  .ledger-recurring-due {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border-radius: 8px;
    padding: 0 7px;
    font-size: 0.75em;
    margin-left: 6px;
  }

  .ledger-recurring-actions {
    white-space: nowrap;
  }

  .ledger-recurring-action-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .ledger-recurring-action-group button {
    margin: 0;
  }

  .ledger-recurring-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
  }

  .ledger-recurring-actions svg {
    display: block;
    fill: var(--text-muted);
    stroke: none;
  }
`;

const MobileRecurringStyles = styled.div`
  margin-top: 16px;

  .ledger-recurring-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ledger-recurring-card {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }

  .ledger-recurring-card-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .ledger-recurring-card-payee {
    flex-grow: 1;
    font-weight: bold;
    overflow-wrap: anywhere;
  }

  .ledger-recurring-card-details {
    color: var(--text-muted);
    font-size: 0.85em;
    margin-top: 4px;
  }

  .ledger-recurring-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .ledger-recurring-due {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border-radius: 8px;
    padding: 0 7px;
    font-size: 0.75em;
  }
`;

interface RecurringRow {
  rt: RecurringTransaction;
  dueDate: string;
  due: boolean;
  total: string;
  from: string;
  to: string;
  summary: string;
}

const useRecurringRows = (
  txCache: TransactionCache,
  settings: ISettings,
): RecurringRow[] =>
  React.useMemo(() => {
    const today = window.moment().format('YYYY-MM-DD');
    const country = settings.holidayCountry;
    return txCache.recurringTransactions
      .map((rt): RecurringRow => {
        const { from, to } = accountsFor(rt);
        const dueDate = effectiveDueDate(rt, country);
        return {
          rt,
          dueDate,
          due: isDue(rt, today, country),
          total: getTotal(
            materializeTransaction(rt, dueDate),
            settings.currencySymbol,
          ),
          from,
          to,
          summary: summarize(rt),
        };
      })
      .sort((a, b) =>
        a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
      );
  }, [
    txCache.recurringTransactions,
    settings.holidayCountry,
    settings.currencySymbol,
  ]);

/**
 * RecurringList renders the recurring transactions below the transaction list,
 * sorted by their next evaluation date. Due transactions can be added to the
 * ledger with one click, and every transaction can be edited or removed.
 */
export const RecurringList: React.FC<{
  txCache: TransactionCache;
  updater: LedgerModifier;
  settings: ISettings;
}> = (props): JSX.Element | null => {
  const rows = useRecurringRows(props.txCache, props.settings);

  if (rows.length === 0) {
    return null;
  }

  return (
    <RecurringStyles>
      <h2 className="ledger-recurring-heading">
        <RecurringIcon size={18} /> Recurring
      </h2>
      <table>
        <thead>
          <tr>
            <th>Next</th>
            <th>Payee</th>
            <th>Schedule</th>
            <th>Total</th>
            <th>From Account</th>
            <th>To Account</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ rt, dueDate, due, total, from, to, summary }) => (
            <tr key={rt.id}>
              <td>
                {dueDate}
                {due ? <span className="ledger-recurring-due">Due</span> : null}
              </td>
              <td>{rt.payee}</td>
              <td>{summary}</td>
              <td>{total}</td>
              <td>{from}</td>
              <td>{to}</td>
              <td className="ledger-recurring-actions">
                <div className="ledger-recurring-action-group">
                  <button
                    onClick={() => props.updater.promptAcceptRecurring(rt)}
                  >
                    Add now
                  </button>
                  <button
                    className="ledger-recurring-icon-button"
                    aria-label="Edit recurring transaction"
                    title="Edit"
                    onClick={() => props.updater.openRecurringEditModal(rt)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="ledger-recurring-icon-button"
                    aria-label="Remove recurring transaction"
                    title="Skip or delete"
                    onClick={() => props.updater.promptRemoveRecurring(rt)}
                  >
                    <RemoveIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </RecurringStyles>
  );
};

/**
 * MobileRecurringList is the card-based variant of RecurringList for the mobile
 * dashboard.
 */
export const MobileRecurringList: React.FC<{
  txCache: TransactionCache;
  updater: LedgerModifier;
  settings: ISettings;
}> = (props): JSX.Element | null => {
  const rows = useRecurringRows(props.txCache, props.settings);

  if (rows.length === 0) {
    return null;
  }

  return (
    <MobileRecurringStyles>
      <h2 className="ledger-recurring-heading">
        <RecurringIcon size={18} /> Recurring
      </h2>
      {rows.map(({ rt, dueDate, due, total, from, to, summary }) => (
        <div className="ledger-recurring-card" key={rt.id}>
          <div className="ledger-recurring-card-row">
            <span className="ledger-recurring-card-payee">{rt.payee}</span>
            <span>{total}</span>
          </div>
          <div className="ledger-recurring-card-details">
            {summary} · next {dueDate}
            {due ? <span className="ledger-recurring-due">Due</span> : null}
          </div>
          <div className="ledger-recurring-card-details">
            {from} ➜ {to}
          </div>
          <div className="ledger-recurring-card-actions">
            <button onClick={() => props.updater.promptAcceptRecurring(rt)}>
              Add now
            </button>
            <button onClick={() => props.updater.openRecurringEditModal(rt)}>
              Edit
            </button>
            <button onClick={() => props.updater.promptRemoveRecurring(rt)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </MobileRecurringStyles>
  );
};
