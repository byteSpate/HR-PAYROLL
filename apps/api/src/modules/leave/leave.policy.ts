export type AccrualBasis = 'PRO_RATED' | 'PER_EVENT' | 'EARNED' | 'NONE';
export function computeEntitlement(annualQuota: number, joiningDate: Date, year: number): number {
  const joined = joiningDate.getUTCFullYear();
  if (joined > year) return 0;
  if (joined < year) return annualQuota;
  return Math.max(0, Math.round(annualQuota * (12 - joiningDate.getUTCMonth()) / 12));
}
export function entitlementFor(type: { accrualBasis: AccrualBasis; annualQuota: number }, joiningDate: Date, year: number, earnedDays: number): number {
  if (type.accrualBasis === 'NONE') return 0;
  if (type.accrualBasis === 'PER_EVENT') return type.annualQuota;
  if (type.accrualBasis === 'EARNED') return earnedDays;
  return computeEntitlement(type.annualQuota, joiningDate, year);
}
export function earnedAccrual(daysWorked: number, joiningDate: Date, asOf: Date, minServiceMonths: number, maxAccrual: number | null): number {
  const eligibleDate = new Date(joiningDate);
  eligibleDate.setUTCMonth(eligibleDate.getUTCMonth() + minServiceMonths);
  if (asOf < eligibleDate) return 0;
  const earned = Math.floor(daysWorked / 18);
  return maxAccrual === null ? earned : Math.min(earned, maxAccrual);
}
