'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RiNotification3Line } from '@remixicon/react';
import type { NotificationItem } from '@erp/contracts/notification';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@erp/ui/components/dropdown-menu';
import { cn } from '@erp/ui/lib/cn';
import { useMarkAllRead, useMarkRead, useNotificationList, useUnreadCount } from '../hooks';

const badgeText = (count: number) => (count > 9 ? '9+' : String(count));

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount().data?.count ?? 0;
  const list = useNotificationList(open);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const choose = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.href) router.push(n.href);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid size-9 place-items-center rounded-md text-ink transition-[transform,background-color] duration-150 ease-out-quint hover:bg-canvas focus-visible:ring-2 focus-visible:ring-rail-from/25 focus-visible:outline-none active:scale-97 motion-reduce:transition-none"
      >
        <RiNotification3Line className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid h-4.25 min-w-4.25 place-items-center rounded-full bg-rail-from px-1 text-[10px] leading-none font-extrabold text-white">
            {badgeText(unread)}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-[13px] font-bold">Notifications</span>
          <button
            type="button"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className="text-[12px] font-semibold text-slate hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {list.isPending ? <p className="px-3 py-6 text-center text-[13px] text-slate">Loading...</p> : null}
          {list.error ? <p className="px-3 py-6 text-center text-[13px] text-destructive">{list.error.message}</p> : null}
          {list.data?.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-slate">No notifications yet.</p>
          ) : null}
          {list.data?.items.map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => choose(n)} className="items-start gap-2.5 px-2.5 py-2">
              <span
                aria-hidden="true"
                className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-rail-from')}
              />
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[13px] leading-snug', n.readAt ? 'font-medium' : 'font-bold')}>{n.title}</span>
                {n.body ? <span className="mt-0.5 block text-[12px] leading-snug text-slate">{n.body}</span> : null}
                <span className="mt-0.5 block text-[11px] text-slate/80">{new Date(n.createdAt).toLocaleString()}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
