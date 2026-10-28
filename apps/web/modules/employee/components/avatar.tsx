import { cn } from '@erp/ui/lib/cn';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

/** The photo when storage serves one, otherwise initials. */
export function EmployeeAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed URLs change per request, so next/image caching does not apply.
    <img src={url} alt={name} className={cn('size-10 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-hidden
      className={cn('flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium', className)}
    >
      {initials(name)}
    </span>
  );
}
