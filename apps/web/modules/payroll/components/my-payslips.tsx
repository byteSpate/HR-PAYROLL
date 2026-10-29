"use client"

import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { ApiError } from "@erp/utils"
import { downloadPayslipPdf, getMyPayslips } from "../api"
import { useSession } from "@/lib/session"
import type { Payslip } from "../types"
import { formatMoney, formatMonth } from "@erp/ui/lib/money"
import { DataTable } from "@erp/ui/dashboard"
import type { TableCell } from "@erp/ui/dashboard"
import { Button } from "@erp/ui/components/button"
import { Skeleton } from "@erp/ui/components/skeleton"
import { downloadBlob } from "./payroll-shared"
import { PayslipDetail } from "./payslip-detail"

export function MyPayslips() {
  const { accessToken } = useSession()
  const [selected, setSelected] = useState<Payslip | null>(null)
  const [error, setError] = useState<string | null>(null)

  const payslipsQuery = useQuery({
    queryKey: ["payslips", "me"],
    queryFn: () => getMyPayslips(accessToken!),
    enabled: !!accessToken,
  })

  const downloadMutation = useMutation({
    mutationFn: async (payslip: Payslip) => {
      const blob = await downloadPayslipPdf(accessToken!, payslip.id)
      downloadBlob(blob, `${payslip.payslipNo}.pdf`)
    },
    onSuccess: () => setError(null),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not download that payslip."),
  })

  if (payslipsQuery.isPending) return <Skeleton className="h-40 w-full" />

  if (payslipsQuery.isError) {
    return (
      <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
        Failed to load your payslips.{" "}
        <Button variant="link" className="h-auto p-0 font-semibold underline" onClick={() => payslipsQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const payslips = payslipsQuery.data ?? []

  if (payslips.length === 0) {
    return (
      <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
        You have no payslips yet. One appears here once a payroll run covering you is approved.
      </div>
    )
  }

  const rows: TableCell[][] = payslips.map((p) => [
    {
      text: p.payrollRun ? formatMonth(p.payrollRun.month, p.payrollRun.year) : "—",
      sub: p.payslipNo,
      weight: 600,
    },
    { text: formatMoney(p.grossPay, p.currency) },
    { text: `−${formatMoney(p.totalDeductions, p.currency)}` },
    {
      // In the employee's own payment currency, with the BDT equivalent
      // beneath when they are not paid in BDT — that is what reached the bank.
      text: formatMoney(p.netPayable, p.currency),
      weight: 600,
      sub: p.currency === "BDT" ? undefined : formatMoney(p.netPayableBdt, "BDT"),
    },
    {
      node: (
        <div className="flex gap-2">
          <Button
            variant="link" className="h-auto p-0 text-[12.5px] font-semibold underline"
            onClick={() => setSelected(p)}
          >
            View
          </Button>
          <Button
            variant="link" className="h-auto p-0 text-[12.5px] font-semibold underline disabled:opacity-50"
            disabled={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate(p)}
          >
            Download
          </Button>
        </div>
      ),
    },
  ])

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-[#F0D9D9] bg-[#FDF6F6] px-5 py-3.5 text-[12.5px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      {selected ? (
        <PayslipDetail payslip={selected} onClose={() => setSelected(null)} />
      ) : (
        <DataTable
          title="Payslip history"
          cols="1.2fr 1fr 1fr 1fr 0.8fr"
          headers={["Month", "Gross", "Deductions", "Net payable", ""]}
          rows={rows}
          action={`${payslips.length} payslip${payslips.length === 1 ? "" : "s"}`}
        />
      )}
    </div>
  )
}

