import Link from 'next/link';
import type { RemixiconComponentType } from '@remixicon/react';
import { cn } from '../lib/cn';
import { tones, type Tone } from './tones';

// A stat card renders full-bleed on a phone, ~215px in a four-up grid and ~385px at 2xl. Sizing it off the
// viewport gets one of those wrong, so it sizes off its own box with container queries.
// The shadow is tinted toward the page's slate: a neutral-black shadow on a cool grey canvas reads as dirt.
const SURFACE =
  '@container flex flex-col gap-2.5 rounded-md border border-line bg-white p-4 shadow-[0_8px_24px_-12px_rgba(28,39,51,0.20)] @[260px]:p-5';

function CardBody({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: Tone;
  icon?: RemixiconComponentType;
}) {
  // Colour means something or it is not used: a stat whose tone says something tints its icon; the rest stay grey.
  const tinted = tone !== 'neutral';
  return (
    <>
      <div className="flex items-center gap-2">
        {Icon ? (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: tinted ? tones[tone].bg : '#F1F4F8', color: tinted ? tones[tone].color : '#33373D' }}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
        <span className="truncate text-[11.5px] font-bold tracking-wide text-slate uppercase">{label}</span>
      </div>
      <div className="min-w-0">
        <div className="font-heading text-xl font-bold tracking-tight whitespace-nowrap tabular-nums @[260px]:text-2xl">
          {value}
        </div>
        {hint ? <div className="mt-0.5 truncate text-xs text-slate">{hint}</div> : null}
      </div>
    </>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: RemixiconComponentType;
  /** A card that links somewhere is a link; without one it stays a plain div rather than a button that goes nowhere. */
  href?: string;
}) {
  const body = <CardBody label={label} value={value} hint={hint} tone={tone} icon={icon} />;
  if (!href) return <div className={SURFACE}>{body}</div>;

  return (
    <Link
      href={href}
      className={cn(
        SURFACE,
        // 180ms sits inside the 150-250ms band a user in a task expects.
        'transition-[box-shadow,transform,border-color] duration-180 ease-out',
        'hover:-translate-y-0.5 hover:border-[#CFD7E0] hover:shadow-[0_14px_30px_-12px_rgba(28,39,51,0.30)]',
        'active:translate-y-0 active:shadow-[0_6px_18px_-12px_rgba(28,39,51,0.28)]',
        'focus-visible:ring-2 focus-visible:ring-rail-from/25 focus-visible:outline-none',
        // The lift is decoration to somebody who asked for less motion; the border and shadow still answer the hover.
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      )}
    >
      {body}
    </Link>
  );
}
