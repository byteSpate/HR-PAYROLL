"use client"

import { holds } from '@/modules/settings/components/require-permission'
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@erp/utils"
import { createPayrollRun, listPayrollRuns } from "../api"
import { useSession } from "@/lib/session"
import { formatMoney, formatMonth } from "@erp/ui/lib/money"
import { DataTable } from "@erp/ui/dashboard"
import { PageHeader } from "@erp/ui/dashboard"
import type { TableCell } from "@erp/ui/dashboard"
import { Button } from "@erp/ui/components/button"
import { Skeleton } from "@erp/ui/components/skeleton"
import { AdjustmentsPanel } from "./adjustments-panel"
import { RUN_STATUS_LABEL, RUN_STATUS_TONE } from "./payroll-shared"
import { RunDetail } from "./run-detail"

/** Last month — the one a run is normally opened for. */
function previousMonth(): { month: number; year: number } {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return { month: prev.getUTCMonth() + 1, year: prev.getUTCFullYear() }
}

/** `runs` and `adjustments` are the two stacked sections of the original page, one route each. */
export function PayrollPage({ view }: { view: "runs" | "adjustments" }) {
  const { accessToken, user, status } = useSession()
  const queryClient = useQueryClient()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAuthed = status === "authenticated" && !!accessToken
  const isAdmin = !!user && holds(user, "payroll.read:all")
  const isFinance = !!user && holds(user, "payroll.manage:all")
  const isHr = !!user && holds(user, "payroll.manage")

  const { month, year } = previousMonth()

  const runsQuery = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: () => listPayrollRuns(accessToken!),
    enabled: isAuthed && isAdmin && view === "runs",
  })

  const createMutation = useMutation({
    mutationFn: () => createPayrollRun(accessToken!, { month, year }),
    onSuccess: (run) => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
      setSelectedRunId(run.id)
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again."),
  })

  if (!isAuthed) return <Skeleton className="h-64 w-full" />

  if (!isAdmin) {
    return (
      <>
        <PageHeader kicker="Workspace" title="Payroll" sub="Payslips and runs" />
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
          You do not have access to payroll.
        </div>
      </>
    )
  }

  if (view === "runs" && selectedRunId) {
    return (
      <>
        <PageHeader kicker="Workspace" title="Payroll" sub="Run detail" />
        <RunDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />
      </>
    )
  }

  const runs = runsQuery.data ?? []
  const rows: TableCell[][] = runs.map((run) => [
    { text: formatMonth(run.month, run.year), weight: 600 },
    { text: String(run.payslipCount ?? 0) },
    { text: formatMoney(run.netPayableBdt ?? "0", "BDT"), weight: 600 },
    { tag: RUN_STATUS_LABEL[run.status], tone: RUN_STATUS_TONE[run.status] },
    {
      node: (
        <Button
          variant="link" className="h-auto p-0 text-[12.5px] font-semibold underline"
          onClick={() => setSelectedRunId(run.id)}
        >
          Open
        </Button>
      ),
    },
  ])

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Payroll"
        sub="Monthly runs, payslips and adjustments"
      />

      {error ? (
        <div className="mb-4 rounded-md border border-[#F0D9D9] bg-[#FDF6F6] px-5 py-3.5 text-[12.5px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        {view === "runs" ? (
          <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[15px] font-bold">Payroll runs</div>
          {isFinance ? (
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Open a run for {formatMonth(month, year)}
            </Button>
          ) : null}
        </div>

        {runsQuery.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : runsQuery.isError ? (
          <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
            Failed to load payroll runs.{" "}
            <Button variant="link" className="h-auto p-0 font-semibold underline" onClick={() => runsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
            No payroll runs yet.
            {isFinance ? " Open one for last month to begin." : ""}
          </div>
        ) : (
          <DataTable
            title="All runs"
            cols="1.2fr 0.7fr 1fr 0.8fr 0.6fr"
            headers={["Month", "Payslips", "Net payable (BDT)", "Status", ""]}
            rows={rows}
            action={`${runs.length} run${runs.length === 1 ? "" : "s"}`}
          />
        )}

          </>
        ) : null}

        {/* The write surface for adjustments. Finance and Super Admin see it read-only —
            they pay adjustments but do not create them. */}
        {view === "adjustments" && (isHr || isAdmin) ? <AdjustmentsPanel month={month} year={year} /> : null}
      </div>
    </>
  )
}
