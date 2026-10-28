import { z } from 'zod';

export const notificationItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().nullable(),
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  nextCursor: z.string().nullable(),
});

export const notificationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type NotificationItem = z.infer<typeof notificationItemSchema>;
export type NotificationList = z.infer<typeof notificationListSchema>;
