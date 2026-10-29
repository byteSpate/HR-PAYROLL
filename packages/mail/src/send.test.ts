import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@erp/db';
import { sendMail, setTransportForTests, dispatchStatus } from './send.js';

describe('sendMail', () => {
  let captured: Array<{ to: string; subject: string; html: string; attachments?: unknown[] }> = [];

  beforeEach(() => {
    captured = [];
    delete process.env.SMTP_HOST;
    setTransportForTests(null);
  });

  afterEach(async () => {
    setTransportForTests(null);
    await prisma.emailDispatch.deleteMany({});
  });

  it('returns SKIPPED and writes one row with neither sentAt nor error when no SMTP_HOST', async () => {
    const result = await sendMail({
      to: 'a@example.com',
      subject: 'Hi',
      html: '<p>hi</p>',
      kind: 'CREDENTIALS',
    });
    expect(result.status).toBe('SKIPPED');

    const row = await prisma.emailDispatch.findUnique({ where: { id: result.dispatchId } });
    expect(row).not.toBeNull();
    expect(row!.to).toBe('a@example.com');
    expect(row!.kind).toBe('CREDENTIALS');
    expect(row!.subject).toBe('Hi');
    expect(row!.sentAt).toBeNull();
    expect(row!.error).toBeNull();
    expect(dispatchStatus(row!)).toBe('SKIPPED');
  });

  it('returns FAILED and stores the message in error without rethrowing when the transport throws', async () => {
    setTransportForTests({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP down')),
    } as unknown as never);
    const result = await sendMail({
      to: 'a@example.com',
      subject: 'Hi',
      html: '<p>hi</p>',
      kind: 'PAYSLIP',
    });
    expect(result.status).toBe('FAILED');

    const row = await prisma.emailDispatch.findUnique({ where: { id: result.dispatchId } });
    expect(row!.error).toBe('SMTP down');
    expect(row!.sentAt).toBeNull();
    expect(dispatchStatus(row!)).toBe('FAILED');
  });

  it('returns SENT and sets sentAt when the transport resolves', async () => {
    setTransportForTests({
      sendMail: vi.fn().mockResolvedValue({}),
    } as unknown as never);
    const result = await sendMail({
      to: 'a@example.com',
      subject: 'Payslip',
      html: '<p>pay</p>',
      kind: 'PAYSLIP',
      entity: 'PAYSLIP',
      entityId: 'ps-1',
    });
    expect(result.status).toBe('SENT');

    const row = await prisma.emailDispatch.findUnique({ where: { id: result.dispatchId } });
    expect(row!.sentAt).not.toBeNull();
    expect(row!.error).toBeNull();
    expect(row!.entity).toBe('PAYSLIP');
    expect(row!.entityId).toBe('ps-1');
    expect(dispatchStatus(row!)).toBe('SENT');
  });

  it('stores the recipient as given and passes attachments to the transport', async () => {
    const content = Buffer.from('pdf bytes');
    setTransportForTests({
      sendMail: vi.fn().mockImplementation((opts: { to: string; attachments?: unknown[] }) => {
        captured.push(opts);
        return Promise.resolve({});
      }),
    } as unknown as never);
    await sendMail({
      to: 'b@example.com',
      subject: 'Hi',
      html: '<p>hi</p>',
      kind: 'SETTLEMENT_STATEMENT',
      attachments: [{ filename: 'stmt.pdf', content, contentType: 'application/pdf' }],
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.to).toBe('b@example.com');
    expect(captured[0]!.attachments).toEqual([{ filename: 'stmt.pdf', content, contentType: 'application/pdf' }]);
  });
});
