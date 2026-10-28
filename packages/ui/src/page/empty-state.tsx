import type { ReactNode } from 'react';

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1.5 rounded-md border border-dashed border-line bg-white px-6 py-12 text-center">
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {body ? <div className="max-w-sm text-[13px] text-slate">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
