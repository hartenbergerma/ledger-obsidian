import { availableDateRangeOptions, DateRange } from '../date-utils';
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
  firstDate: Moment;
  customStart?: Moment;
  customEnd?: Moment;
  onCustomDatesChange?: (start: Moment, end: Moment) => void;
}> = (props): JSX.Element => {
  const [localStart, setLocalStart] = React.useState<string>(
    () =>
      props.customStart?.format('YYYY-MM-DD') ??
      window.moment().subtract(1, 'month').format('YYYY-MM-DD'),
  );
  const [localEnd, setLocalEnd] = React.useState<string>(
    () => props.customEnd?.format('YYYY-MM-DD') ?? window.moment().format('YYYY-MM-DD'),
  );

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

  const handleApply = (): void => {
    const start = window.moment(localStart);
    const end = window.moment(localEnd);
    if (start.isValid() && end.isValid() && !start.isAfter(end)) {
      props.onCustomDatesChange?.(start, end);
    }
  };

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

      {props.range === 'custom' && (
        <CustomDateRow>
          <DatePicker
            type="date"
            value={localStart}
            onChange={(e) => setLocalStart(e.target.value)}
          />
          <Separator>–</Separator>
          <DatePicker
            type="date"
            value={localEnd}
            onChange={(e) => setLocalEnd(e.target.value)}
          />
          <Button selected={false} action={handleApply}>
            Apply
          </Button>
        </CustomDateRow>
      )}
    </SelectorContainer>
  );
};
