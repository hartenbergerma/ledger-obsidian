import { availableDateRangeOptions, DateRange } from '../date-utils';
import { Button } from './SharedStyles';
import { Moment } from 'moment';
import React from 'react';
import styled from 'styled-components';

const SelectorContainer = styled.div`
  display: flex;
  flex-wrap: wrap;

  button {
    margin: 4px;
  }
`;

export const DateRangeSelector: React.FC<{
  range: DateRange;
  setRange: (range: DateRange) => void;
  firstDate: Moment;
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
    </SelectorContainer>
  );
};
