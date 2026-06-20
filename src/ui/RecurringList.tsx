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
import { DeleteIcon, EditIcon } from './ActionIcons';
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

const RecurringStyles = styled.div`
  margin-top: 24px;
  /* Match the regular transaction table's right padding so both tables are the
   * same width. */
  padding-right: 1rem;

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
    text-align: right;
  }

  .ledger-recurring-actions .ledger-row-actions {
    justify-content: flex-end;
  }

  .ledger-recurring-actions button {
    margin: 0;
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
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
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
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }

  /* Match the Add/Skip button height to the round edit/delete buttons (40px,
     from the shared .is-mobile .ledger-row-action rule) so they line up. */
  .ledger-recurring-card-actions > button {
    height: 40px;
    padding: 0 16px;
    border-radius: 20px;
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
                <span className="ledger-row-actions">
                  <button
                    onClick={() => props.updater.promptAcceptRecurring(rt)}
                  >
                    Add/Skip
                  </button>
                  <button
                    className="ledger-row-action"
                    aria-label="Edit recurring transaction"
                    title="Edit"
                    onClick={() => props.updater.openRecurringEditModal(rt)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="ledger-row-action"
                    aria-label="Delete recurring transaction"
                    title="Delete"
                    onClick={() => props.updater.promptDeleteRecurring(rt)}
                  >
                    <DeleteIcon />
                  </button>
                </span>
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
            <span className="ledger-recurring-card-payee">
              <span className="ledger-recurring-card-payee-name">
                {rt.payee}
              </span>
              {due ? <span className="ledger-recurring-due">Due</span> : null}
            </span>
            <span>{total}</span>
          </div>
          <div className="ledger-recurring-card-details">
            {summary} · next {dueDate}
          </div>
          <div className="ledger-recurring-card-details">
            {from} ➜ {to}
          </div>
          <div className="ledger-recurring-card-actions">
            <button onClick={() => props.updater.promptAcceptRecurring(rt)}>
              Add/Skip
            </button>
            <span className="ledger-row-actions">
              <button
                className="ledger-row-action"
                aria-label="Edit recurring transaction"
                title="Edit"
                onClick={() => props.updater.openRecurringEditModal(rt)}
              >
                <EditIcon />
              </button>
              <button
                className="ledger-row-action"
                aria-label="Delete recurring transaction"
                title="Delete"
                onClick={() => props.updater.promptDeleteRecurring(rt)}
              >
                <DeleteIcon />
              </button>
            </span>
          </div>
        </div>
      ))}
    </MobileRecurringStyles>
  );
};
