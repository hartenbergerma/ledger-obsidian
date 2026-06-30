import { TagFilter } from './Tag';
import { Platform } from 'obsidian';
import React from 'react';
import styled from 'styled-components';

/**
 * SearchIcon is the magnifying-glass glyph used for the transaction search
 * control.
 */
const SearchIcon: React.FC<{ size?: number }> = ({ size = 16 }): JSX.Element => (
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
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ToolbarStyle = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 4px 0 12px;

  /* The search control sits on the left. Collapsed it is just an icon button;
     expanded it becomes a search bar. */
  .ledger-search {
    flex: 0 0 auto;
    order: 1;
  }

  .ledger-search-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 6px 10px;
  }

  .ledger-search-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .ledger-search-bar svg {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .ledger-search-input {
    border: none;
    background: transparent;
    width: 180px;
    max-width: 100%;
    margin: 0;
    padding: 4px 0;
  }

  .ledger-search-input:focus {
    box-shadow: none;
  }

  .ledger-search-clear {
    flex-shrink: 0;
    margin: 0;
    padding: 0 6px;
    background: transparent;
    border: none;
    box-shadow: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1.1em;
    line-height: 1;
  }

  .ledger-search-clear:hover {
    color: var(--text-normal);
  }

  /* The tag filter takes the middle and grows to fill the row. min-width:0 lets
     it shrink so the add button stays on the row. */
  .ledger-toolbar-tags {
    flex: 1 1 auto;
    min-width: 0;
    order: 2;
  }

  /* The tag filter supplies its own outer margin when standalone; inside the
     toolbar the toolbar owns the spacing, so drop it. */
  .ledger-toolbar-tags .ledger-tag-filter {
    margin: 0;
  }

  /* The "Add to Ledger" button is pinned to the right of the row. */
  .ledger-toolbar-add {
    flex: 0 0 auto;
    order: 3;
    margin: 0;
    margin-left: auto;
  }

  /* Expanded search: on desktop it is a fixed-ish width search bar so the tag
     filter is simply shifted to the right. */
  &.ledger-toolbar-search-open .ledger-search {
    flex: 0 1 280px;
  }

  &.ledger-toolbar-search-open .ledger-search-input {
    width: 100%;
  }

  /* On mobile, an expanded search bar grows to fill the first line (with the add
     button still pinned to its right) and the tag filter wraps onto the line
     below. */
  &.ledger-toolbar-mobile.ledger-toolbar-search-open .ledger-search {
    flex: 1 1 auto;
  }

  &.ledger-toolbar-mobile.ledger-toolbar-search-open .ledger-toolbar-add {
    order: 2;
  }

  &.ledger-toolbar-mobile.ledger-toolbar-search-open .ledger-toolbar-tags {
    order: 3;
    flex-basis: 100%;
  }
`;

const SearchControl: React.FC<{
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}> = ({ open, setOpen, value, onChange }): JSX.Element => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <div className="ledger-search">
        <button
          type="button"
          className="ledger-search-button"
          onClick={() => setOpen(true)}
          title="Search transactions"
          aria-label="Search transactions"
        >
          <SearchIcon size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="ledger-search">
      <div className="ledger-search-bar">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          className="ledger-search-input"
          placeholder="Search payee or memo…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onChange('');
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="ledger-search-clear"
          aria-label="Close search"
          title="Close search"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
};

/**
 * TransactionToolbar renders the controls above a transaction list: a search
 * control on the left, the tag filter in the middle, and an "Add to Ledger"
 * button pinned to the right. The search prioritizes the Payee and the memos of
 * each transaction.
 */
export const TransactionToolbar: React.FC<{
  allTags: string[];
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
}> = (props): JSX.Element => {
  // Keep the search bar open whenever there is an active query (e.g. after a
  // re-render) so the field does not collapse out from under the user.
  const [open, setOpen] = React.useState(props.search !== '');

  const className = [
    'ledger-tx-toolbar',
    Platform.isMobile ? 'ledger-toolbar-mobile' : '',
    open ? 'ledger-toolbar-search-open' : '',
  ]
    .filter((c) => c)
    .join(' ');

  return (
    <ToolbarStyle className={className}>
      <SearchControl
        open={open}
        setOpen={setOpen}
        value={props.search}
        onChange={props.onSearchChange}
      />
      <div className="ledger-toolbar-tags">
        <TagFilter
          allTags={props.allTags}
          selectedTag={props.selectedTag}
          onToggleTag={props.onToggleTag}
        />
      </div>
      <button
        type="button"
        className="ledger-toolbar-add mod-cta"
        onClick={props.onAdd}
      >
        Add to Ledger
      </button>
    </ToolbarStyle>
  );
};
