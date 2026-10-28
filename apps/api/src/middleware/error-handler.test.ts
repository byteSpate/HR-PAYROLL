import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '@erp/utils';
import { errorHandler } from './error-handler.js';

function appThrowing(err: unknown) {
  const app = express();
  app.get('/', () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('sends an AppError with its status, code and details', async () => {
    const res = await request(appThrowing(new AppError(400, '2 row(s) have errors', 'IMPORT_INVALID', { issues: [1, 2] })))
      .get('/');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '2 row(s) have errors', code: 'IMPORT_INVALID', issues: [1, 2] });
  });

  it('does not let details overwrite the error message', async () => {
    const res = await request(appThrowing(new AppError(409, 'Taken', undefined, { error: 'spoof' }))).get('/');
    expect(res.body).toEqual({ error: 'Taken' });
  });

  it('hides unexpected errors behind a 500', async () => {
    const res = await request(appThrowing(new Error('db password is hunter2'))).get('/');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
