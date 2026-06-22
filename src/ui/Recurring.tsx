import React from 'react';
import styled from 'styled-components';

const weekdayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * RecurringFormValue holds the recurrence configuration as edited in the
 * transaction form. `enabled` controls whether the transaction is saved as a
 * recurring transaction.
 */
export interface RecurringFormValue {
  enabled: boolean;
  intervalCount: number;
  unit: 'week' | 'month';
  weekday: number; // 0 (Sun) - 6 (Sat), used when unit is 'week'
  dayOfMonth: number; // 1-31, used when unit is 'month'
  adjustToWorkday: boolean;
}

export const defaultRecurringValue: RecurringFormValue = {
  enabled: false,
  intervalCount: 1,
  unit: 'month',
  weekday: 1,
  dayOfMonth: 1,
  adjustToWorkday: false,
};

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * summarizeRecurrence renders a short human-readable description of a recurrence
 * such as "Every 2 weeks on Monday" or "Monthly on the 15th".
 */
export const summarizeRecurrence = (value: RecurringFormValue): string => {
  const everyN = value.intervalCount === 1 ? '' : `${value.intervalCount} `;
  if (value.unit === 'week') {
    const unit = value.intervalCount === 1 ? 'week' : 'weeks';
    return `Every ${everyN}${unit} on ${weekdayLabels[value.weekday]}`;
  }
  const unit = value.intervalCount === 1 ? 'month' : 'months';
  return `Every ${everyN}${unit} on the ${ordinal(value.dayOfMonth)}`;
};

/**
 * RecurringIcon renders the "two arrows circling each other" repeat glyph used
 * throughout the UI to denote recurring transactions.
 *
 * The feather "repeat" artwork fills its 24x24 box edge-to-edge, which makes it
 * read larger than other glyphs once scaled up. `padding` insets the glyph by
 * widening the viewBox (leaving space around the arrows) without changing the
 * rendered size, so the pill can size the icon to match the tag pills while
 * keeping the arrows from looking oversized.
 */
export const RecurringIcon: React.FC<{ size?: number; padding?: number }> = ({
  size = 16,
  padding = 4,
}): JSX.Element => (
  <svg
    className="ledger-recurring-icon"
    width={size}
    height={size}
    viewBox={`${-padding} ${-padding} ${24 + padding * 2} ${24 + padding * 2}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const RecurringPillStyle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 0px 7px;
  margin: 2px 3px 2px 0;
  font-size: 0.75em;
  line-height: 1.6;
  color: var(--text-muted);
  background: var(--background-secondary-alt);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  white-space: nowrap;
  vertical-align: middle;
  font-weight: normal;

  .ledger-recurring-icon {
    flex-shrink: 0;
    opacity: 0.75;
    margin: 0;
    fill: none;
    stroke: currentColor;
  }

  .ledger-recurring-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ledger-recurring-remove {
    flex-shrink: 0;
    margin-left: 1px;
    padding: 0 2px;
    border-radius: 8px;
    cursor: pointer;
    opacity: 0.8;
  }

  .ledger-recurring-remove:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
  }

  &.clickable {
    cursor: pointer;
  }

  &.clickable:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  &.selected {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }
`;

/**
 * InfoIcon renders a small circled "i" glyph.
 */
export const InfoIcon: React.FC<{ size?: number }> = ({
  size = 13,
}): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

/**
 * RecurringPill renders a small rounded pill with the recurring icon and an
 * optional label, mirroring how tags are displayed. When onClick is provided it
 * behaves as a button (e.g. to edit the recurrence or filter by it), and when
 * onRemove is provided it shows an "×" to clear the recurrence.
 */
export const RecurringPill: React.FC<{
  label?: string;
  title?: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}> = ({ label, title, selected, onClick, onRemove }): JSX.Element => {
  const className = [
    'ledger-recurring',
    onClick ? 'clickable' : '',
    selected ? 'selected' : '',
  ]
    .filter((c) => c)
    .join(' ');
  return (
    <RecurringPillStyle
      className={className}
      title={title || label || 'Recurring'}
      onClick={onClick}
      onMouseDown={onClick ? (e) => e.preventDefault() : undefined}
    >
      {/* The pill sizes the icon to line up with the tag pills; padding insets
          the edge-to-edge "repeat" glyph so its arrows aren't oversized. */}
      <RecurringIcon size={19} padding={6} />
      {label ? <span className="ledger-recurring-label">{label}</span> : null}
      {onRemove ? (
        <span
          className="ledger-recurring-remove"
          aria-label="Remove recurrence"
          role="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </span>
      ) : null}
    </RecurringPillStyle>
  );
};

const RecurringSelectStyle = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;

  &.ledger-recurring-select-open {
    flex-basis: 100%;
  }

  .ledger-recurring-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 6px 10px;
  }

  .ledger-recurring-button .ledger-recurring-icon {
    fill: none;
    stroke: currentColor;
  }

  .ledger-recurring-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 320px;
    max-width: 100%;
    padding: 10px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .ledger-recurring-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ledger-recurring-row input[type='number'] {
    width: 3.5em;
    flex: 0 0 auto;
  }

  /* Keep the unit / weekday selects only as wide as their widest option. */
  .ledger-recurring-row select {
    width: auto;
    flex: 0 0 auto;
  }

  .ledger-recurring-workday {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    font-size: 0.9em;
  }

  .ledger-recurring-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .ledger-recurring-checkbox input[type='checkbox'] {
    margin: 0;
    flex-shrink: 0;
    /* Override the form's width:100% rule so the checkbox stays square. */
    width: 16px;
    height: 16px;
  }

  .ledger-info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .ledger-info-icon:hover {
    color: var(--text-normal);
  }

  .ledger-recurring-help {
    align-self: flex-start;
    max-width: 260px;
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .ledger-recurring-panel-buttons {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }
`;

/**
 * RecurringSelect lets the user turn a transaction into a recurring transaction
 * and configure its schedule. When no recurrence is set it shows a button with
 * the repeat icon; clicking it opens an inline panel (the same pattern as the
 * tag selector). When a recurrence is set it shows a summary pill which can be
 * removed to make the transaction one-off again.
 */
export const RecurringSelect: React.FC<{
  value: RecurringFormValue;
  onChange: (value: RecurringFormValue) => void;
}> = ({ value, onChange }): JSX.Element => {
  const [open, setOpen] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);
  // Local draft so edits in the panel only take effect when confirmed.
  const [draft, setDraft] = React.useState<RecurringFormValue>(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  if (value.enabled && !open) {
    return (
      <RecurringSelectStyle>
        <RecurringPill
          label={summarizeRecurrence(value)}
          title="Edit recurrence"
          onClick={() => {
            setDraft(value);
            setOpen(true);
          }}
          onRemove={() => onChange({ ...value, enabled: false })}
        />
      </RecurringSelectStyle>
    );
  }

  if (!open) {
    return (
      <RecurringSelectStyle>
        <button
          type="button"
          className="ledger-recurring-button"
          onClick={() => {
            setDraft({ ...value });
            setOpen(true);
          }}
          title="Make this a recurring transaction"
          aria-label="Make this a recurring transaction"
        >
          <RecurringIcon size={18} />
        </button>
      </RecurringSelectStyle>
    );
  }

  const update = (patch: Partial<RecurringFormValue>): void =>
    setDraft({ ...draft, ...patch });

  return (
    <RecurringSelectStyle className="ledger-recurring-select-open">
      <div className="ledger-recurring-panel">
        <div className="ledger-recurring-row">
          <span>Repeat every</span>
          <input
            type="number"
            min={1}
            value={draft.intervalCount}
            onChange={(e) =>
              update({
                intervalCount: Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
          />
          <select
            value={draft.unit}
            onChange={(e) =>
              update({ unit: e.target.value as 'week' | 'month' })
            }
          >
            <option value="week">week(s)</option>
            <option value="month">month(s)</option>
          </select>
        </div>

        {draft.unit === 'week' ? (
          <div className="ledger-recurring-row">
            <span>on</span>
            <select
              value={draft.weekday}
              onChange={(e) =>
                update({ weekday: parseInt(e.target.value, 10) })
              }
            >
              {weekdayLabels.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="ledger-recurring-row">
            <span>on the</span>
            <input
              type="number"
              min={1}
              max={31}
              value={draft.dayOfMonth}
              onChange={(e) =>
                update({
                  dayOfMonth: Math.min(
                    31,
                    Math.max(1, parseInt(e.target.value, 10) || 1),
                  ),
                })
              }
            />
            <span>of the month</span>
          </div>
        )}

        <div className="ledger-recurring-workday">
          <label className="ledger-recurring-checkbox">
            <input
              type="checkbox"
              checked={draft.adjustToWorkday}
              onChange={(e) => update({ adjustToWorkday: e.target.checked })}
            />
            Workdays only
          </label>
          <button
            type="button"
            className="ledger-info-icon"
            aria-label="What does “Workdays only” mean?"
            onClick={() => setShowHelp((s) => !s)}
          >
            <InfoIcon />
          </button>
        </div>
        {showHelp ? (
          <div className="ledger-recurring-help">
            If an occurrence falls on a weekend or public holiday, it is moved
            to the next working day. Choose your country under the plugin
            settings (Holiday Country).
          </div>
        ) : null}

        <div className="ledger-recurring-panel-buttons">
          <button
            type="button"
            onClick={() => {
              onChange({ ...draft, enabled: true });
              setOpen(false);
            }}
          >
            {value.enabled ? 'Update' : 'Add recurrence'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setOpen(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </RecurringSelectStyle>
  );
};
