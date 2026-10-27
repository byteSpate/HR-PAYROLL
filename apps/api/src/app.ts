import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { modules, resolveModuleOrder } from '@erp/contracts';
import { parseOrigins } from './cors.js';
import { env } from './env.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiMounts } from './modules/index.js';

export function createApp(): Express {
  // Throws on an unknown dep or a cycle, so a broken manifest stops boot.
  resolveModuleOrder(modules);

  const app = express();
  // Exactly one hop: a client cannot spoof its address with its own X-Forwarded-For.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: parseOrigins(env.CORS_ORIGINS, env.CLIENT_ORIGIN), credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  for (const [prefix, router] of apiMounts) {
    app.use(`/api${prefix}`, router);
  }

  app.use(errorHandler);
  return app;
}
