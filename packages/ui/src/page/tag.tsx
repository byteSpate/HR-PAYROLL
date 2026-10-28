import { tones, type Tone } from './tones';

export function Tag({ label, tone }: { label: string; tone: Tone }) {
  const { bg, color } = tones[tone];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}
