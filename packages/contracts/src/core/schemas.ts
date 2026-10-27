import { z } from 'zod';

export const loginSchema = z.object({
  // Emails are stored lowercase, so lookups must be case- and whitespace-insensitive.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase(),
  displayName: z.string(),
  roleIds: z.array(z.string()).min(1),
});

export const updateUserRolesSchema = z.object({
  roleIds: z.array(z.string()),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const roleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(z.string()),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  permissions: z.array(z.string()),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
