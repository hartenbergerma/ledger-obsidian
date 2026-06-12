import { DateRange, dateRangeOptions } from '../date-utils';
import { Button } from './SharedStyles';
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
}> = (props): JSX.Element => (
  <SelectorContainer className="ledger-daterange-selectors">
    {dateRangeOptions.map(({ id, label }) => (
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
