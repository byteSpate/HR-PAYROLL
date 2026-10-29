import type { ExpenseClaim } from '@erp/contracts/expense';
import type { Prisma } from '@erp/db';
import { formatDateOnly } from '@erp/export';

export const CLAIM_INCLUDE = {
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  category: { select: { id: true, code: true, name: true } },
} as const;

export type ClaimRow = Prisma.ExpenseClaimGetPayload<{ include: typeof CLAIM_INCLUDE }>;

/** A claim as the screens read it: money as strings, the spend date as a calendar date, decision fields under HR-MNG-V1's names. */
export function claimView(row: ClaimRow): ExpenseClaim {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    travelFrom: row.travelFrom,
    travelTo: row.travelTo,
    amount: row.amount.toFixed(2),
    categoryId: row.categoryId,
    category: { code: row.category.code, name: row.category.name },
    description: row.description,
    status: row.status,
    expenseDate: formatDateOnly(row.expenseDate),
    currency: row.currency,
    fxRateToBdt: row.fxRateToBdt?.toFixed(6) ?? null,
    reviewedBy: row.decidedBy,
    reviewedAt: row.decidedAt?.toISOString() ?? null,
    reviewNote: row.decisionNote,
    payslipId: row.payslipId,
    settlementId: row.settlementId,
    createdAt: row.createdAt.toISOString(),
    employee: row.employee,
  };
}
