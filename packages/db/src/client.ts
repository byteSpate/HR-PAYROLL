import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from './generated/prisma/client.js';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  // Prisma's defaults (2 s to start, 5 s to run) are too tight for a write that
  // also records an audit row and outbox events.
  transactionOptions: { maxWait: 10_000, timeout: 15_000 },
});

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
