import 'dotenv/config';
import { z } from 'zod';
import { refreshLifetimeMs } from '@erp/auth';

// Fail at startup rather than at the first login: a bad lifetime would otherwise surface as 500s.
const lifetime = (value: string, ctx: z.RefinementCtx) => {
  try {
    refreshLifetimeMs(value);
  } catch (err) {
    ctx.addIssue({ code: 'custom', message: (err as Error).message });
  }
};

// A blank line copied from .env.example means "not set", not an invalid empty value.
const optionalSetting = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  // Separate from CLIENT_ORIGIN, which is also the base for outbound links where a list would corrupt URLs.
  CORS_ORIGINS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m').superRefine(lifetime),
  JWT_REFRESH_EXPIRY: z.string().default('7d').superRefine(lifetime),
  APP_TIMEZONE: z.string().default('Asia/Dhaka'),
  // The first day attendance is tracked: earlier days read as "not tracked" instead of absent. The
  // default is far enough back that it never applies until a go-live date is set.
  ATTENDANCE_GO_LIVE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'ATTENDANCE_GO_LIVE must be a YYYY-MM-DD date')
    .default('2000-01-01'),
  COMPANY_NAME: z.string().default('Byte Spate'),
  // Optional: without them uploads return 503 and avatars fall back to initials. A partial set is a
  // typo, so it fails startup instead of silently turning storage off.
  CLOUDINARY_CLOUD_NAME: optionalSetting,
  CLOUDINARY_API_KEY: optionalSetting,
  CLOUDINARY_API_SECRET: optionalSetting,
}).superRefine((value, ctx) => {
  const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
  const missing = keys.filter((k) => !value[k]);
  if (missing.length > 0 && missing.length < keys.length) {
    ctx.addIssue({ code: 'custom', message: `Set all Cloudinary settings or none; missing ${missing.join(', ')}` });
  }
});

export const env = envSchema.parse(process.env);
