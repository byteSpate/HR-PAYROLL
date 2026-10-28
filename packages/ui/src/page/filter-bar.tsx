'use client';

import type { ReactNode } from 'react';
import { RiCloseLine, RiSearchLine } from '@remixicon/react';
import { Button } from '../components/button';
import { Input } from '../components/input';

// Search and filters for a list. The count is not decoration: once a filter is on, the difference between
// "nobody matches" and "the list failed to load" is the only thing the reader needs.
export function FilterBar({
  search,
  onSearch,
  placeholder,
  children,
  shown,
  total,
  noun,
  active,
  onClear,
}: {
  search: string;
  onSearch: (next: string) => void;
  placeholder: string;
  /** The filter controls for this page, in the order they should read. */
  children?: ReactNode;
  shown: number;
  total: number;
  /** Plural, lowercase: "employees". */
  noun: string;
  /** Whether anything is filtering right now, search included. */
  active: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 flex-1 sm:max-w-[300px]">
        {/* z-10: the input paints its own background over anything positioned earlier in the DOM. */}
        <RiSearchLine
          className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-[#8792A3]"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-md border-line pl-9 text-[13px] placeholder:text-[#8792A3]"
        />
      </div>

      {children}

      {/* ml-auto only from sm up: below that the toolbar is a column and this would be stranded opposite nothing. */}
      <div className="flex items-center gap-x-2 text-[12.5px] text-slate sm:ml-auto">
        {/* Announced on change, so a filter that removes every row is not a silent event. */}
        <span aria-live="polite">
          <span className="font-semibold text-ink">{active ? shown : total}</span>
          {active ? ` of ${total} ${noun}` : ` ${noun}`}
        </span>
        {active ? (
          <Button
            variant="ghost"
            onClick={onClear}
            className="h-auto rounded-md px-2 py-1 text-[12.5px] font-semibold text-slate transition-colors hover:bg-[#F1F4F8] hover:text-ink"
          >
            <RiCloseLine className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
