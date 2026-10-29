import type { PayslipBreakdown, PayslipLine } from '@erp/contracts/payroll';
import { prisma } from '@erp/db';
import { BRAND_DOC_CSS, brandAsset, brandDocHeaderHtml, escapeHtml, renderPdf } from '@erp/pdf';
import { AppError } from '@erp/utils';
import { env } from '../../env.js';

/** The payslip document, with {{PLACEHOLDERS}} filled by `renderPayslipHtml`. Copied from HR-MNG-V1. */
const PAYSLIP_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      {{BRAND_CSS}}
      * { box-sizing: border-box; }
      body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
             font-size: 12px; color: #17191C; margin: 0; padding: 32px; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      .muted { color: #17191C; }
      .row { display: flex; justify-content: space-between; align-items: flex-start; }
      .company { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #18181b; }
      .meta { margin: 16px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; }
      .meta div span { display: block; }
      .label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #17191C; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
           background: #17191C; color: #FFFFFF; padding: 6px 8px; }
      td { padding: 5px 8px; border-bottom: 1px solid #f4f4f5; }
      td.num, th.num { text-align: right; }
      h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
           color: #17191C; margin: 16px 0 0; }
      .total td { font-weight: 600; border-top: 1px solid #18181b; border-bottom: none; }
      .net { margin-top: 16px; padding: 12px 16px; background: #f4f4f5; border-radius: 6px; }
      .net .amount { font-size: 20px; font-weight: 600; }
      .fx { margin-top: 12px; padding: 10px 14px; border: 1px solid #e4e4e7;
            border-radius: 6px; font-size: 11px; }
      footer { margin-top: 24px; font-size: 10px; color: #17191C;
               border-top: 1px solid #e4e4e7; padding-top: 10px; }
    </style>
  </head>
  <body>
    {{BRAND_HEADER}}

    <div class="meta">
      <div><span class="label">Employee</span><span>{{EMPLOYEE_NAME}}</span></div>
      <div><span class="label">Employee ID</span><span>{{EMPLOYEE_CODE}}</span></div>
      <div><span class="label">Payslip No</span><span>{{PAYSLIP_NO}}</span></div>
      <div><span class="label">Currency</span><span>{{CURRENCY}}</span></div>
    </div>

    <h2>Attendance</h2>
    <div class="meta">
      <div><span class="label">Calendar days</span><span>{{CALENDAR_DAYS}}</span></div>
      <div><span class="label">Payable days</span><span>{{PAYABLE_DAYS}}</span></div>
      <div><span class="label">Loss of pay</span><span>{{LOP_DAYS}}</span></div>
      <div><span class="label">Paid leave</span><span>{{PAID_LEAVE}}</span></div>
    </div>

    <h2>Earnings</h2>
    <table>
      <thead><tr><th>Description</th><th>Basis</th><th class="num">Amount</th></tr></thead>
      <tbody>{{EARNINGS_ROWS}}</tbody>
    </table>

    <h2>Deductions</h2>
    <table>
      <thead><tr><th>Description</th><th>Basis</th><th class="num">Amount</th></tr></thead>
      <tbody>{{DEDUCTIONS_ROWS}}</tbody>
    </table>

    {{REIMBURSEMENTS_SECTION}}

    <div class="net row">
      <div>
        <span class="label">Net payable</span>
        <span class="muted">Net pay {{NET_PAY}} plus reimbursements {{REIMBURSEMENTS_TOTAL}}</span>
      </div>
      <div class="amount">{{CURRENCY}} {{NET_PAYABLE}}</div>
    </div>

    {{FX_SECTION}}

    <footer>
      Generated {{GENERATED_AT}}. This is a computer-generated statement.
    </footer>
  </body>
</html>
`;

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

function lineRows(lines: PayslipLine[], currency: string): string {
  if (lines.length === 0) {
    return `<tr><td colspan="3" class="muted">None</td></tr>`;
  }
  return lines
    .map((line) => {
      const basis =
        line.calc === 'PERCENT_OF_BASIC'
          ? `${line.value}% of basic`
          : line.calc === 'ADJUSTMENT'
            ? 'Adjustment'
            : 'Fixed';
      return `<tr><td>${escapeHtml(line.label)}</td><td class="muted">${basis}</td><td class="num">${currency} ${line.amount}</td></tr>`;
    })
    .join('');
}

function totalRow(label: string, currency: string, amount: string): string {
  return `<tr class="total"><td>${label}</td><td></td><td class="num">${currency} ${amount}</td></tr>`;
}

export function renderPayslipHtml(
  payslip: {
    payslipNo: string;
    currency: string;
    calendarDays: number;
    lopDays: { toFixed(n: number): string };
    payableDays: { toFixed(n: number): string };
    grossPay: { toFixed(n: number): string };
    totalDeductions: { toFixed(n: number): string };
    netPay: { toFixed(n: number): string };
    reimbursements: { toFixed(n: number): string };
    netPayable: { toFixed(n: number): string };
    netPayableBdt: { toFixed(n: number): string };
    fxRateToBdt: { toFixed(n: number): string };
    breakdown: unknown;
    employee: { fullName: string; employeeCode: string };
    payrollRun: { month: number; year: number };
  },
  logo: string | null = null,
): string {
  const template = PAYSLIP_TEMPLATE;
  const breakdown = payslip.breakdown as PayslipBreakdown;
  const currency = payslip.currency;

  // Earning adjustments belong with earnings, deduction adjustments with
  // deductions — the document groups by effect, not by data source.
  const earningAdjustments = (breakdown.adjustments ?? []).filter((a) => a.kind === 'EARNING');
  const deductionAdjustments = (breakdown.adjustments ?? []).filter((a) => a.kind === 'DEDUCTION');

  const earningsRows =
    lineRows([...(breakdown.earnings ?? []), ...earningAdjustments], currency) +
    totalRow('Gross pay', currency, payslip.grossPay.toFixed(2));
  const deductionsRows =
    lineRows([...(breakdown.deductions ?? []), ...deductionAdjustments], currency) +
    totalRow('Total deductions', currency, payslip.totalDeductions.toFixed(2));

  // Reimbursements get their own section, never folded into earnings —
  // folding them in would misrepresent returned money as wages.
  const claims = breakdown.reimbursements ?? [];
  const reimbursementsSection =
    claims.length === 0
      ? ''
      : `<h2>Reimbursements</h2>
         <table>
           <thead><tr><th>Category</th><th>Spent on</th><th class="num">Amount</th></tr></thead>
           <tbody>${claims
             .map(
               (claim) =>
                 `<tr><td>${escapeHtml(claim.category)}</td><td class="muted">${claim.expenseDate}${
                   claim.spentCurrency !== currency
                     ? ` · ${claim.spentCurrency} ${claim.spentAmount} @ ${claim.fxRateToBdt}`
                     : ''
                 }</td><td class="num">${currency} ${claim.amount}</td></tr>`,
             )
             .join('')}</tbody>
         </table>`;

  // For a non-BDT payslip, show the frozen rate and the BDT equivalent — that
  // is what actually reached the bank.
  const fxSection =
    currency === 'BDT'
      ? ''
      : `<div class="fx">Converted at the rate frozen for this payroll month:
           1 ${currency} = ${payslip.fxRateToBdt.toFixed(6)} BDT.
           Net payable <strong>BDT ${payslip.netPayableBdt.toFixed(2)}</strong>,
           which is the figure the bank file pays.</div>`;

  const period = `${MONTHS[payslip.payrollRun.month - 1]} ${payslip.payrollRun.year}`;
  const replacements: Record<string, string> = {
    BRAND_CSS: BRAND_DOC_CSS,
    BRAND_HEADER: brandDocHeaderHtml({
      logo,
      company: env.COMPANY_NAME,
      title: 'Payslip',
      lines: [period, [env.COMPANY_NAME, env.COMPANY_ADDRESS].filter(Boolean).join(', ')],
    }),
    COMPANY_NAME: escapeHtml(env.COMPANY_NAME),
    COMPANY_ADDRESS: escapeHtml(env.COMPANY_ADDRESS),
    PERIOD: period,
    EMPLOYEE_NAME: escapeHtml(payslip.employee.fullName),
    EMPLOYEE_CODE: escapeHtml(payslip.employee.employeeCode),
    PAYSLIP_NO: escapeHtml(payslip.payslipNo),
    CURRENCY: currency,
    CALENDAR_DAYS: String(payslip.calendarDays),
    PAYABLE_DAYS: payslip.payableDays.toFixed(2),
    LOP_DAYS: payslip.lopDays.toFixed(2),
    PAID_LEAVE: String(breakdown.attendance?.onPaidLeave ?? 0),
    EARNINGS_ROWS: earningsRows,
    DEDUCTIONS_ROWS: deductionsRows,
    REIMBURSEMENTS_SECTION: reimbursementsSection,
    NET_PAY: payslip.netPay.toFixed(2),
    REIMBURSEMENTS_TOTAL: payslip.reimbursements.toFixed(2),
    NET_PAYABLE: payslip.netPayable.toFixed(2),
    FX_SECTION: fxSection,
    GENERATED_AT: new Date().toISOString().slice(0, 10),
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => replacements[key] ?? '');
}

/**
 * Renders on request and returns the bytes. Not cached: a payslip is one page and rendering is cheap next to the
 * storage round trip, and a cache that can go stale on a reprocessed run is worse than none.
 */
export async function renderPayslipPdf(payslipId: string): Promise<Buffer> {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      employee: { select: { fullName: true, employeeCode: true } },
      payrollRun: { select: { month: true, year: true } },
    },
  });
  if (!payslip) throw new AppError(404, 'Payslip not found');
  const html = renderPayslipHtml(payslip, await brandAsset('logo'));
  return renderPdf(html, {
    format: 'a4',
    printBackground: true,
    margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
  });
}
