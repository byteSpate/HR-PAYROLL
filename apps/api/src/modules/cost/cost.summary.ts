import { prisma } from '@erp/db';
import { officeToday } from '@erp/export';
import { summariseCosts } from './cost.derive.js';

export async function monthlySummary(year: number, month: number) {
  const bills = await prisma.operatingCost.findMany({
    where: { periodYear: year, periodMonth: month },
    include: { category: true },
  });
  return summariseCosts(
    bills.map((b) => ({
      status: b.status,
      dueDate: b.dueDate,
      amount: b.amount,
      currency: b.currency,
      categoryId: b.categoryId,
      categoryName: b.category.name,
    })),
    officeToday(),
  );
}
