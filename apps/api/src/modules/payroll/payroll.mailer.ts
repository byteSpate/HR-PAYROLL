import { prisma, toMoneyString } from '@erp/db';
import { renderEmail, sendMail } from '@erp/mail';
import { AppError } from '@erp/utils';
import { env } from '../../env.js';
import { renderPayslipPdf } from './payroll.pdf.js';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * A run is in flight if its claim is set and recent. A bare boolean would wedge the run forever if the server
 * died mid-send; the window lets a stale claim be reclaimed without a manual database edit. The claim lives on
 * the row, not in memory, so it survives a restart and spans servers.
 */
export const IN_FLIGHT_WINDOW_MS = 30 * 60 * 1000;

export interface EmailStatus {
  total: number;
  sent: number;
  failed: number;
  inProgress: boolean;
}

export async function getEmailStatus(runId: string): Promise<EmailStatus> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: { emailStartedAt: true, deletedAt: true },
  });
  if (!run || run.deletedAt) throw new AppError(404, 'Payroll run not found');
  const [total, sent, failed] = await Promise.all([
    prisma.payslip.count({ where: { payrollRunId: runId } }),
    prisma.payslip.count({ where: { payrollRunId: runId, emailedAt: { not: null } } }),
    // Errored and never sent: counting errors alone would double-count one that failed and later went out.
    prisma.payslip.count({
      where: { payrollRunId: runId, emailError: { not: null }, emailedAt: null },
    }),
  ]);
  const inProgress =
    !!run.emailStartedAt && Date.now() - run.emailStartedAt.getTime() < IN_FLIGHT_WINDOW_MS;
  return { total, sent, failed, inProgress };
}

/**
 * Claims the run for sending, or says someone already has. The claim is one conditional update, so two
 * simultaneous starts cannot both win.
 */
export async function claimEmailRun(runId: string): Promise<void> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: { status: true, deletedAt: true },
  });
  if (!run || run.deletedAt) throw new AppError(404, 'Payroll run not found');
  if (run.status !== 'APPROVED' && run.status !== 'DISBURSED') {
    throw new AppError(409, 'Payslips can only be emailed once the run is approved');
  }
  const now = new Date();
  const claimed = await prisma.payrollRun.updateMany({
    where: {
      id: runId,
      OR: [
        { emailStartedAt: null },
        { emailStartedAt: { lt: new Date(now.getTime() - IN_FLIGHT_WINDOW_MS) } },
      ],
    },
    data: { emailStartedAt: now },
  });
  if (claimed.count === 0)
    throw new AppError(409, 'Payslips for this run are already being emailed');
}

/**
 * Sends each unsent payslip in turn, recording `emailedAt` on success and `emailError` on failure, so a partial
 * send is reportable and re-runnable. Never throws: it runs after the request has answered. Mail with no SMTP
 * configured is recorded as not sent, because nothing reached anybody.
 */
export async function emailPayslipsForRun(
  runId: string,
  opts: { resend?: boolean } = {},
): Promise<void> {
  try {
    const payslips = await prisma.payslip.findMany({
      where: opts.resend ? { payrollRunId: runId } : { payrollRunId: runId, emailedAt: null },
      include: {
        employee: { select: { fullName: true, user: { select: { email: true } } } },
        payrollRun: { select: { month: true, year: true } },
      },
    });
    for (const payslip of payslips) {
      try {
        const period = `${MONTHS[payslip.payrollRun.month - 1]} ${payslip.payrollRun.year}`;
        const netPayable = toMoneyString(payslip.netPayable);
        const pdf = await renderPayslipPdf(payslip.id);
        const result = await sendMail({
          to: payslip.employee.user.email,
          kind: 'PAYSLIP',
          subject: `Payslip for ${period} - ${payslip.payslipNo}`,
          html: await renderEmail({
            serial: payslip.payslipNo,
            subject: `Payslip for ${period}`,
            stamp: { label: 'Issued', tone: 'issued' },
            intro: `Dear ${payslip.employee.fullName}, your payslip for ${period} is attached.`,
            facts: [{ label: 'Net payable', value: `${payslip.currency} ${netPayable}` }],
            notice: `Attached: ${payslip.payslipNo}.pdf - if anything looks wrong, reply to this email and we will check it.`,
            footer: `You are receiving this because payroll for ${period} was approved at ${env.COMPANY_NAME}.`,
          }),
          entity: 'PAYSLIP',
          entityId: payslip.id,
          attachments: [{ filename: `${payslip.payslipNo}.pdf`, content: pdf }],
        });
        await prisma.payslip.update({
          where: { id: payslip.id },
          data:
            result.status === 'SENT'
              ? { emailedAt: new Date(), emailError: null }
              : {
                  emailError:
                    result.status === 'SKIPPED'
                      ? 'Not sent: email is not configured on this server'
                      : 'The mail server refused it',
                },
        });
      } catch (err) {
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: { emailError: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  } finally {
    await prisma.payrollRun.update({ where: { id: runId }, data: { emailStartedAt: null } });
  }
}
