import { Values } from './EditTransaction';
import { FieldProps } from 'formik';
import Fuse from 'fuse.js';
import React from 'react';
import { usePopper } from 'react-popper';
import styled from 'styled-components';

// TODO: Consider switching from Fuse to Match-Sorter
// https://github.com/kentcdodds/match-sorter

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 40%;

  input {
    width: 100%;
    /* Leave room for the clear button so it does not overlap the text. */
    padding-right: 1.6em;
  }

  .ledger-suggest-clear {
    position: absolute;
    right: 0.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    height: 1em;
    line-height: 1;
    border-radius: 3px;
    cursor: pointer;
    color: var(--text-muted);
  }

  .ledger-suggest-clear:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
`;

export const TextSuggest: React.FC<
  {
    placeholder: string;
    suggestions: string[];
    displayCount: number;

    /**
     * onSelectValue is called whenever the user commits a value to the field,
     * either by choosing a suggestion (click or Enter) or by blurring the
     * input. It is used, for example, to pre-fill account fields when a payee
     * is entered.
     */
    onSelectValue?: (value: string) => void;
  } & FieldProps<string, Values>
> = (props): JSX.Element => {
  const [currentValue, setCurrentValue] = React.useState(props.field.value);
  const [currentSuggestions, setCurrentSuggestions] = React.useState(
    props.suggestions.slice(0, props.displayCount),
  );
  const [fuse, setFuse] = React.useState(
    new Fuse(props.suggestions, { threshold: 0.5 }),
  );

  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const [visible, setVisibility] = React.useState(false);
  const [referenceElement, setReferenceElement] =
    React.useState<HTMLElement | null>(null);
  const [popperElement, setPopperElement] = React.useState<HTMLElement | null>(
    null,
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: 'bottom-start',
  });

  const updateCurrentSuggestions = (newValue: string): void => {
    const newSuggestions =
      newValue === ''
        ? props.suggestions.slice(0, props.displayCount)
        : fuse
            .search(newValue)
            .map((result) => result.item)
            .slice(0, props.displayCount);
    setCurrentSuggestions(newSuggestions);
    setSelectedIndex(Math.min(selectedIndex, newSuggestions.length - 1));
  };

  const commitValue = (newValue: string): void => {
    setCurrentValue(newValue);
    props.form.setFieldValue(props.field.name, newValue);
    if (props.onSelectValue) {
      props.onSelectValue(newValue);
    }
  };

  // The Fuse object will not be automatically replaced when the suggestions are
  // changed so we need to detect and update manually.
  React.useEffect(() => {
    setFuse(new Fuse(props.suggestions, { threshold: 0.5 }));
    updateCurrentSuggestions(currentValue);
  }, [props.suggestions]);

  // Keep the local input value in sync when the field value is changed
  // externally (e.g. the lines are pre-filled after a payee is selected).
  React.useEffect(() => {
    setCurrentValue(props.field.value);
  }, [props.field.value]);

  return (
    <>
      <InputWrapper>
        <input
          ref={(el) => {
            inputRef.current = el;
            setReferenceElement(el);
          }}
          type="text"
          value={currentValue}
          placeholder={props.placeholder}
          onChange={(e) => {
            setVisibility(true);
            setCurrentValue(e.target.value);
            updateCurrentSuggestions(e.target.value);
          }}
          onFocus={() => {
            setVisibility(true);
            setSelectedIndex(0);
          }}
          onBlur={(e) => {
            setVisibility(false);
            commitValue(e.target.value);
          }}
          onKeyDown={(e) => {
            switch (e.key) {
              case 'ArrowUp':
                setSelectedIndex(
                  Math.clamp(
                    selectedIndex - 1,
                    0,
                    currentSuggestions.length - 1,
                  ),
                );
                e.preventDefault();
                return;
              case 'ArrowDown':
                setSelectedIndex(
                  Math.clamp(
                    selectedIndex + 1,
                    0,
                    currentSuggestions.length - 1,
                  ),
                );
                e.preventDefault();
                return;
              case 'Enter':
                if (currentSuggestions[selectedIndex] !== undefined) {
                  commitValue(currentSuggestions[selectedIndex]);
                }
                setVisibility(false);
                e.preventDefault();
                return;
            }
          }}
        />
        {currentValue !== '' ? (
          <span
            className="ledger-suggest-clear"
            aria-label="Clear"
            // Use onMouseDown with preventDefault so the input does not blur
            // (and re-commit the old value) before the field is cleared.
            onMouseDown={(e) => {
              e.preventDefault();
              setVisibility(false);
              commitValue('');
              updateCurrentSuggestions('');
              inputRef.current?.focus();
            }}
          >
            ×
          </span>
        ) : null}
      </InputWrapper>

      {visible ? (
        <div
          className="suggestion-container"
          ref={setPopperElement}
          style={styles.popper}
          {...attributes.popper}
        >
          {currentSuggestions.map((s, i) => (
            <Suggestion
              value={s}
              key={s}
              selected={i === selectedIndex}
              onClick={() => {
                commitValue(s);
                setVisibility(false);
              }}
              onHover={() => {
                setSelectedIndex(i);
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
};

const Suggestion: React.FC<{
  value: string;
  selected: boolean;
  onClick: () => void;
  onHover: () => void;
}> = ({ value, selected, onClick, onHover }): JSX.Element => (
  <div
    className={'suggestion-item ' + (selected ? 'is-selected' : '')}
    onMouseDown={onClick}
    onMouseOver={onHover}
  >
    {value}
  </div>
);
