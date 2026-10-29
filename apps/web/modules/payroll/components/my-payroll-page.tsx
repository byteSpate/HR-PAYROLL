"use client"

import { PageHeader } from "@erp/ui/dashboard"
import { MyPayslips } from "./my-payslips"

export function MyPayrollPage() {
  return (
    <>
      <PageHeader kicker="Workspace" title="Payroll" sub="Your payslips, earnings and deductions" />
      <MyPayslips />
    </>
  )
}
