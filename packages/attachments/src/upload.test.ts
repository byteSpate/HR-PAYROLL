import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '@erp/utils';
import { uploadSingle } from './index.js';

function app() {
  const a = express();
  a.post('/', uploadSingle('file', { maxBytes: 10, mimeTypes: ['application/pdf'] }), (req, res) => {
    res.json({ name: req.file?.originalname, size: req.file?.size });
  });
  // Express needs the four-argument signature to treat this as error middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof AppError ? err.status : 500;
    res.status(status).json({ error: (err as Error).message });
  });
  return a;
}

describe('uploadSingle', () => {
  it('accepts an allowed type within the size limit', async () => {
    const res = await request(app()).post('/').attach('file', Buffer.from('%PDF-1'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'a.pdf', size: 6 });
  });

  it('rejects a file over the size limit with 413', async () => {
    const res = await request(app()).post('/').attach('file', Buffer.alloc(11), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
  });

  it('rejects a disallowed type with 415', async () => {
    const res = await request(app()).post('/').attach('file', Buffer.from('x'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(415);
  });

  it('rejects a file in the wrong field with 400', async () => {
    const res = await request(app()).post('/').attach('other', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });
});
