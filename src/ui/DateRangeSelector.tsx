import { DateRange, dateRangeOptions } from '../date-utils';
import { Button, DatePicker } from './SharedStyles';
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
`;

// The custom date inputs live on their own full-width row so that on a narrow
// (mobile) screen they wrap below the range buttons rather than squeezing in
// beside them.
const CustomDateRow = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const Separator = styled.span`
  color: var(--text-muted);
`;

export const DateRangeSelector: React.FC<{
  range: DateRange;
  setRange: (range: DateRange) => void;
  customStart: Moment;
  customEnd: Moment;
  onCustomDatesChange: (start: Moment, end: Moment) => void;
}> = (props): JSX.Element => {
  const [localStart, setLocalStart] = React.useState<string>(() =>
    props.customStart.format('YYYY-MM-DD'),
  );
  const [localEnd, setLocalEnd] = React.useState<string>(() =>
    props.customEnd.format('YYYY-MM-DD'),
  );

  // Push the new dates up as soon as the user has entered a valid range. There
  // is no apply button; the chart updates live just like the preset buttons.
  const update = (start: string, end: string): void => {
    const startMoment = window.moment(start, 'YYYY-MM-DD', true);
    const endMoment = window.moment(end, 'YYYY-MM-DD', true);
    if (
      startMoment.isValid() &&
      endMoment.isValid() &&
      !startMoment.isAfter(endMoment)
    ) {
      props.onCustomDatesChange(startMoment, endMoment);
    }
  };

  return (
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

      {props.range === 'custom' && (
        <CustomDateRow>
          <DatePicker
            type="date"
            value={localStart}
            onChange={(e) => {
              setLocalStart(e.target.value);
              update(e.target.value, localEnd);
            }}
          />
          <Separator>–</Separator>
          <DatePicker
            type="date"
            value={localEnd}
            onChange={(e) => {
              setLocalEnd(e.target.value);
              update(localStart, e.target.value);
            }}
          />
        </CustomDateRow>
      )}
    </SelectorContainer>
  );
};
