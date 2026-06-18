import { availableDateRangeOptions, DateRange } from '../date-utils';
import { Button } from './SharedStyles';
import { Moment } from 'moment';
import React from 'react';
import styled from 'styled-components';

const SelectorContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;

  button {
    margin: 4px;
  }

  .ledger-daterange-custom {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 4px;
  }

  /* Keep the date fields only as wide as the date itself needs. */
  .ledger-daterange-custom input {
    width: auto;
    flex: 0 0 auto;
  }

  .ledger-daterange-custom-sep {
    color: var(--text-muted);
  }
`;

export const DateRangeSelector: React.FC<{
  range: DateRange;
  setRange: (range: DateRange) => void;
  firstDate: Moment;
  customStart: Moment;
  customEnd: Moment;
  setCustomStart: (date: Moment) => void;
  setCustomEnd: (date: Moment) => void;
}> = (props): JSX.Element => {
  const options = React.useMemo(
    () => availableDateRangeOptions(props.firstDate),
    [props.firstDate],
  );

  // If the currently selected range is no longer available (e.g. the data is
  // too recent to fill it), fall back to showing all transactions.
  React.useEffect(() => {
    if (!options.some(({ id }) => id === props.range)) {
      props.setRange('all');
    }
  }, [options, props.range]);

  return (
    <SelectorContainer className="ledger-daterange-selectors">
      {options.map(({ id, label }) => (
        <Button
          key={id}
          selected={props.range === id}
          action={() => props.setRange(id)}
        >
          {label}
        </Button>
      ))}
      {props.range === 'custom' ? (
        <span className="ledger-daterange-custom">
          <input
            type="date"
            aria-label="Start date"
            value={props.customStart.format('YYYY-MM-DD')}
            max={props.customEnd.format('YYYY-MM-DD')}
            onChange={(e) => {
              if (e.target.value) {
                props.setCustomStart(
                  window.moment(e.target.value, 'YYYY-MM-DD'),
                );
              }
            }}
          />
          <span className="ledger-daterange-custom-sep">to</span>
          <input
            type="date"
            aria-label="End date"
            value={props.customEnd.format('YYYY-MM-DD')}
            min={props.customStart.format('YYYY-MM-DD')}
            onChange={(e) => {
              if (e.target.value) {
                props.setCustomEnd(window.moment(e.target.value, 'YYYY-MM-DD'));
              }
            }}
          />
        </span>
      ) : null}
    </SelectorContainer>
  );
};
