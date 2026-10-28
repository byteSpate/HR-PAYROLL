'use client';

import type { RemixiconComponentType } from '@remixicon/react';
import { Button } from '../components/button';
import { cn } from '../lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
  Icon?: RemixiconComponentType;
}

// One choice out of a few, side by side: the queue a manager is looking at, a list or a calendar. For a filter
// over a list with counts, use FilterChip. `aria-pressed` and not a radio group: these switch a view.
// Every button is `variant="ghost"` on purpose: the default variant paints `bg-primary` under whatever classes
// are passed, which left the unselected half dark with grey text twice before this component existed.
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Names the group for a screen reader, for example "Queue shown". */
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex rounded-md border border-line bg-white p-0.5', className)}>
      {options.map(({ value: optionValue, label: optionLabel, Icon }) => {
        const active = optionValue === value;
        return (
          <Button
            key={optionValue}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={cn(
              'gap-1.5 rounded px-3 text-[12px] transition-colors',
              active
                ? 'bg-rail-from font-bold text-white hover:bg-rail-from hover:text-white'
                : 'font-semibold text-slate hover:bg-[#F1F4F8] hover:text-ink',
            )}
          >
            {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            {optionLabel}
          </Button>
        );
      })}
    </div>
  );
}
