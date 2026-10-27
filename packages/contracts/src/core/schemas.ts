import { z } from 'zod';

export const loginSchema = z.object({
  // Emails are stored lowercase, so lookups must be case- and whitespace-insensitive.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export const scopeSchema = z.enum(['own', 'team', 'department', 'all']);

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase(),
  displayName: z.string(),
  roleId: z.string().nullable().optional(),
});

export const updateUserRoleSchema = z.object({
  roleId: z.string().nullable(),
});

// SUPER_ADMIN is deliberately not assignable: it moves only through the server CLI.
export const updateUserAccessLevelSchema = z.object({
  accessLevel: z.enum(['ADMIN', 'STANDARD']),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// scope is null for an on/off permission.
export const roleGrantSchema = z.object({
  permissionKey: z.string(),
  scope: scopeSchema.nullable(),
});

export const roleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(roleGrantSchema),
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
  accessLevel: z.enum(['SUPER_ADMIN', 'ADMIN', 'STANDARD']),
  role: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** 'key' or 'key:scope'; empty for SUPER_ADMIN and ADMIN, who hold everything. */
  grants: z.array(z.string()),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
