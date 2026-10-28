'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';

// Muted tints for the initials fallback. A directory of forty people with no photos was forty
// identical grey squares; a stable colour per person makes a card recognisable before it is read.
// Every pair clears 4.5:1, so the initials stay legible rather than decorative.
const TINTS = [
  { bg: '#E7EDF7', fg: '#33507A' },
  { bg: '#E8F0EA', fg: '#3A5C43' },
  { bg: '#F5EBE4', fg: '#7A4E2E' },
  { bg: '#EEEAF6', fg: '#4F3D78' },
  { bg: '#E5F0F1', fg: '#2F5B60' },
  { bg: '#F6E9EC', fg: '#7A3B4C' },
] as const;

// Stable across renders and reloads: the same person is always the same colour.
function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  /** Owns size and radius: circles in the chrome, rounded squares on cards. */
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const tint = tintFor(name);

  return (
    // A one-cell grid, so the photo and the initials share the square and the photo can fade over them.
    <span className={cn('grid size-9 shrink-0 overflow-hidden rounded-full', className)} style={{ background: tint.bg }}>
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 grid place-items-center text-[13px] font-bold"
        style={{ color: tint.fg }}
      >
        {initialsFrom(name)}
      </span>
      {avatarUrl ? (
        // A plain <img>: avatars are signed storage URLs that next/image would need allow-listed per host.
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn(
            'col-start-1 row-start-1 size-full object-cover transition-opacity duration-200 ease-out-quint motion-reduce:transition-none',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
    </span>
  );
}
