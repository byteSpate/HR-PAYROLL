import type { OutstandingExpenseReimbursements } from '@erp/contracts/expense';
import { prisma, ZERO, type Money } from '@erp/db';
import { MS_PER_DAY } from '@erp/export';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';

/**
 * Claims approved but not yet picked up by payroll or a settlement. These are obligations, not a date-range
 * report: every open item stays here until one of the two reimbursement paths takes it.
 */
export async function getOutstandingReimbursements(viewer: Viewer, now = new Date()): Promise<OutstandingExpenseReimbursements> {
  const employee = await scopeForViewer(viewer, 'expense.manage');
  const claims = await prisma.expenseClaim.findMany({
    where: { employee, status: 'APPROVED', payslipId: null, settlementId: null },
    select: {
      id: true,
      name: true,
      decidedAt: true,
      amount: true,
      currency: true,
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      category: { select: { code: true, name: true } },
    },
    orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
  });

  const byCurrency = new Map<string, { claims: number; amount: Money }>();
  const rows = claims.map((claim) => {
    const total = byCurrency.get(claim.currency) ?? { claims: 0, amount: ZERO };
    byCurrency.set(claim.currency, { claims: total.claims + 1, amount: total.amount.plus(claim.amount) });
    return {
      id: claim.id,
      employee: claim.employee,
      name: claim.name,
      category: claim.category,
      approvedAt: claim.decidedAt?.toISOString() ?? null,
      ageDays: claim.decidedAt ? Math.max(0, Math.floor((now.getTime() - claim.decidedAt.getTime()) / MS_PER_DAY)) : null,
      amount: claim.amount.toFixed(2),
      currency: claim.currency,
    };
  });

  return {
    rows,
    totals: {
      claims: rows.length,
      byCurrency: [...byCurrency.entries()].map(([currency, t]) => ({ currency: currency as 'BDT' | 'USD', claims: t.claims, amount: t.amount.toFixed(2) })).sort((a, b) => a.currency.localeCompare(b.currency)),
    },
  };
}
