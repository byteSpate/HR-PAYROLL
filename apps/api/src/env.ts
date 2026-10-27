import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  // Separate from CLIENT_ORIGIN, which is also the base for outbound links where a list would corrupt URLs.
  CORS_ORIGINS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  APP_TIMEZONE: z.string().default('Asia/Dhaka'),
  COMPANY_NAME: z.string().default('Byte Spate'),
});

export const env = envSchema.parse(process.env);
