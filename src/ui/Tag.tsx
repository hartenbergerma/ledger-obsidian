import {
  isRecurringTag,
  RECURRING_TAG_FILTER,
  sanitizeTag,
} from '../transaction-utils';
import { RecurringPill } from './Recurring';
import React from 'react';
import styled from 'styled-components';

const TagIcon: React.FC<{ size?: number }> = ({ size = 10 }): JSX.Element => (
  <svg
    className="ledger-tag-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const TagPillStyle = styled.span`
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

  .ledger-tag-icon {
    flex-shrink: 0;
    opacity: 0.75;
    /* Be explicit so the icon is unaffected by surrounding svg rules (e.g. the
     * action icons in the transaction table set stroke/fill to none). */
    margin: 0;
    fill: none;
    stroke: currentColor;
  }

  .ledger-tag-label {
    overflow: hidden;
    text-overflow: ellipsis;
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

  .ledger-tag-remove {
    flex-shrink: 0;
    margin-left: 1px;
    padding: 0 2px;
    border-radius: 8px;
    cursor: pointer;
    opacity: 0.8;
  }

  .ledger-tag-remove:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
  }
`;

/**
 * TagPill renders a tag as a small rounded grey pill, prefixed with a tag icon.
 * When onClick is provided it behaves as a button (e.g. to filter by the tag),
 * and when onRemove is provided it shows an "×" to remove the tag.
 */
export const TagPill: React.FC<{
  tag: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}> = ({ tag, selected, onClick, onRemove }): JSX.Element => {
  const className = [
    'ledger-tag',
    onClick ? 'clickable' : '',
    selected ? 'selected' : '',
  ]
    .filter((c) => c)
    .join(' ');
  return (
    <TagPillStyle
      className={className}
      title={`#${tag}`}
      onClick={onClick}
      // Keep focus where it is (e.g. on a form field) when used as a button.
      onMouseDown={onClick ? (e) => e.preventDefault() : undefined}
    >
      <TagIcon />
      <span className="ledger-tag-label">{tag}</span>
      {onRemove ? (
        <span
          className="ledger-tag-remove"
          aria-label="Remove tag"
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
    </TagPillStyle>
  );
};

const TagSelectStyle = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;

  /* When the picker panel is open, take a full row of the button group so the
   * panel drops onto its own line instead of stretching the "Add Split" row. */
  &.ledger-tag-select-open {
    flex-basis: 100%;
  }

  .ledger-tag-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    /* Square-ish icon button that matches the height of the adjacent buttons. */
    padding: 6px 10px;
  }

  .ledger-tag-button .ledger-tag-icon {
    fill: none;
    stroke: currentColor;
  }

  .ledger-tag-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 240px;
    max-width: 100%;
    padding: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .ledger-tag-input {
    width: 100%;
  }

  .ledger-tag-options {
    display: flex;
    flex-direction: column;
    max-height: 180px;
    overflow-y: auto;
  }

  .ledger-tag-option {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .ledger-tag-option:hover {
    background: var(--background-modifier-hover);
  }

  .ledger-tag-create {
    color: var(--text-muted);
    font-size: 0.85em;
  }

  .ledger-tag-empty {
    padding: 3px 6px;
    color: var(--text-muted);
    font-size: 0.85em;
  }
`;

/**
 * TagSelect lets the user assign a single tag to a transaction. When a tag is
 * set it is shown as a removable pill; removing it brings back the "+ Tag"
 * button. The button opens an inline panel with a field to filter or create a
 * tag and a list of the existing tags in the file. Choosing a tag replaces any
 * current one.
 *
 * The panel is rendered inline (rather than as a floating dropdown) so it reads
 * keyboard input reliably inside the modal and never overlaps the account
 * fields above it.
 */
export const TagSelect: React.FC<{
  tag: string;
  allTags: string[];
  onChange: (tag: string) => void;
}> = ({ tag, allTags, onChange }): JSX.Element => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selectTag = (raw: string): void => {
    const sanitized = sanitizeTag(raw);
    if (sanitized !== '') {
      onChange(sanitized);
    }
    setQuery('');
    setOpen(false);
  };

  if (tag !== '') {
    // A tag is set: show it in place of the "+ Tag" button. Removing it reveals
    // the button again.
    return (
      <TagSelectStyle>
        <TagPill tag={tag} onRemove={() => onChange('')} />
      </TagSelectStyle>
    );
  }

  const normalizedQuery = sanitizeTag(query);
  // The internal recurring marker tags are not offered as selectable tags.
  const selectableTags = allTags.filter((t) => !isRecurringTag(t));
  const suggestions = selectableTags.filter(
    (t) =>
      normalizedQuery === '' ||
      t.toLowerCase().includes(normalizedQuery.toLowerCase()),
  );
  const canCreate =
    normalizedQuery !== '' &&
    !selectableTags.some(
      (t) => t.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  if (!open) {
    return (
      <TagSelectStyle>
        <button
          type="button"
          className="ledger-tag-button"
          onClick={() => {
            setOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          title="Tag this transaction"
          aria-label="Tag this transaction"
        >
          <TagIcon size={18} />
        </button>
      </TagSelectStyle>
    );
  }

  return (
    <TagSelectStyle className="ledger-tag-select-open">
      <div className="ledger-tag-panel">
        <input
          ref={inputRef}
          type="text"
          className="ledger-tag-input"
          placeholder="Filter or create tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Close when focus leaves the panel (e.g. clicking elsewhere). The
          // options use onMouseDown so a selection registers before the blur.
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (normalizedQuery !== '') {
                selectTag(query);
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <div className="ledger-tag-options">
          {suggestions.map((t) => (
            // Select on mouseDown so it fires before the input's blur closes
            // the panel (the same pattern the account/payee suggestions use).
            <div
              key={t}
              className="ledger-tag-option"
              onMouseDown={() => selectTag(t)}
            >
              <TagPill tag={t} />
            </div>
          ))}
          {canCreate ? (
            <div
              className="ledger-tag-option ledger-tag-create"
              onMouseDown={() => selectTag(query)}
            >
              Create <TagPill tag={normalizedQuery} />
            </div>
          ) : null}
          {suggestions.length === 0 && !canCreate ? (
            <div className="ledger-tag-empty">
              {selectableTags.length === 0
                ? 'No tags yet — type to create one'
                : 'No matching tags'}
            </div>
          ) : null}
        </div>
      </div>
    </TagSelectStyle>
  );
};

const TagFilterStyle = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin: 4px 0 12px;

  .ledger-tag-filter-label {
    margin-right: 6px;
    color: var(--text-muted);
    font-size: 0.85em;
  }
`;

/**
 * TagFilter renders the set of tags found in the file as togglable pills. At
 * most one tag may be selected at a time; selecting a tag restricts the
 * transaction list to transactions with that tag. Renders nothing when there
 * are no tags.
 */
export const TagFilter: React.FC<{
  allTags: string[];
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
}> = ({ allTags, selectedTag, onToggleTag }): JSX.Element | null => {
  // The recurring marker tags are not shown as ordinary tag pills; instead a
  // single recurring icon filters down to all recurring transactions.
  const normalTags = allTags.filter((t) => !isRecurringTag(t));
  const hasRecurring = allTags.some(isRecurringTag);

  if (normalTags.length === 0 && !hasRecurring) {
    return null;
  }
  return (
    <TagFilterStyle className="ledger-tag-filter">
      <span className="ledger-tag-filter-label">Filter by tag:</span>
      {normalTags.map((t) => (
        <TagPill
          key={t}
          tag={t}
          selected={selectedTag === t}
          onClick={() => onToggleTag(t)}
        />
      ))}
      {hasRecurring ? (
        <RecurringPill
          title="Show recurring transactions"
          selected={selectedTag === RECURRING_TAG_FILTER}
          onClick={() => onToggleTag(RECURRING_TAG_FILTER)}
        />
      ) : null}
    </TagFilterStyle>
  );
};
