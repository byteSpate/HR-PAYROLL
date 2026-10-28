'use client';

import { cn } from '../lib/cn';

// One value of a one-of-many facet, such as department in the directory. A row of chips beats a select for a
// handful of values: the options and the current one are readable without a press, and the counts turn the
// filter into a summary. `aria-pressed` rather than a radio group: these toggle a view and nothing is submitted.
export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap',
        'transition-[transform,background-color,border-color,color] duration-150 ease-out-quint',
        'focus-visible:ring-2 focus-visible:ring-rail-from/25 focus-visible:outline-none',
        'active:scale-97 motion-reduce:transition-none',
        active
          ? 'border-rail-from bg-rail-from text-white'
          : 'border-line bg-white text-[#3F4A59] hover:border-[#CFD6E0] hover:bg-[#F7F9FC]',
      )}
    >
      {label}
      {count === undefined ? null : (
        <span className={cn('text-[11px] font-bold', active ? 'text-white/60' : 'text-[#98A2B1]')}>{count}</span>
      )}
    </button>
  );
}
