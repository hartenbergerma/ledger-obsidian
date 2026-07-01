import { TagFilter } from './Tag';
import { Platform, setIcon } from 'obsidian';
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

  /* Round icon buttons, shared by the search and add controls. */
  .ledger-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    margin: 0;
    border-radius: 50%;
  }

  .ledger-icon-button svg {
    width: 18px;
    height: 18px;
  }

  /* The search control sits on the left. Collapsed it is just a round icon
     button; expanded it becomes a search bar. */
  .ledger-search {
    flex: 0 0 auto;
    order: 1;
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

  /* The tag filter (only shown while the search is open) takes the middle and
     grows to fill the row. min-width:0 lets it shrink so the add button stays on
     the row. */
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
    margin-left: auto;
  }

  /* Larger, easier touch targets for the round buttons on mobile. */
  &.ledger-toolbar-mobile .ledger-icon-button {
    width: 40px;
    height: 40px;
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
  onOpen: () => void;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
}> = ({ open, onOpen, onClose, value, onChange }): JSX.Element => {
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
          className="ledger-search-button ledger-icon-button"
          onClick={onOpen}
          title="Search and filter transactions"
          aria-label="Search and filter transactions"
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
              onClose();
            }
          }}
        />
        <button
          type="button"
          className="ledger-search-clear"
          aria-label="Close search"
          title="Close search"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
};

/**
 * AddButton renders a round button that opens the "Add to Ledger" form. It uses
 * the same "ledger" icon as the ribbon button in the Obsidian sidebar.
 */
const AddButton: React.FC<{ onClick: () => void }> = ({
  onClick,
}): JSX.Element => {
  const ref = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, 'ledger');
    }
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="ledger-toolbar-add ledger-icon-button mod-cta"
      onClick={onClick}
      title="Add to Ledger"
      aria-label="Add to Ledger"
    />
  );
};

/**
 * TransactionToolbar renders the controls above a transaction list: a round
 * search/filter button on the left and a round "Add to Ledger" button on the
 * right. Clicking the search button reveals a search bar (searching the Payee
 * and memos) together with the tag filter; closing it clears the search query
 * and resets the tag selection.
 */
export const TransactionToolbar: React.FC<{
  allTags: string[];
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
}> = (props): JSX.Element => {
  const [open, setOpen] = React.useState(false);

  const handleClose = (): void => {
    setOpen(false);
    props.onSearchChange('');
    // Reset the tag filter when the search/filter panel is closed.
    if (props.selectedTag) {
      props.onToggleTag(props.selectedTag);
    }
  };

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
        onOpen={() => setOpen(true)}
        onClose={handleClose}
        value={props.search}
        onChange={props.onSearchChange}
      />
      {open ? (
        <div className="ledger-toolbar-tags">
          <TagFilter
            allTags={props.allTags}
            selectedTag={props.selectedTag}
            onToggleTag={props.onToggleTag}
          />
        </div>
      ) : null}
      <AddButton onClick={props.onAdd} />
    </ToolbarStyle>
  );
};
