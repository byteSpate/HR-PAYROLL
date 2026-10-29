"use client"

import { holds } from '@/modules/settings/components/require-permission'
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@erp/utils"
import { listEmployees } from "../../employee/api"
import {
  approveSettlement,
  calculateSettlement,
  listSettlements,
  paySettlement,
  rejectSettlement,
} from "../api"
import { useSession } from "@/lib/session"
import type { Settlement } from "../types"
import { formatMoney } from "@erp/ui/lib/money"
import { DataTable } from "@erp/ui/dashboard"
import { PageHeader } from "@erp/ui/dashboard"
import type { TableCell } from "@erp/ui/dashboard"
import { Button } from "@erp/ui/components/button"
import { Skeleton } from "@erp/ui/components/skeleton"
import { DecisionDialog } from "@erp/ui/dashboard"
import {
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_TONE,
} from "../../payroll/components/payroll-shared"
import { ExitChecklistPanel } from "../../asset/components/exit-checklist-panel"
import { SettlementDetail } from "./settlement-detail"

export function SettlementPage() {
  const { accessToken, user, status } = useSession()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAuthed = status === "authenticated" && !!accessToken
  const isAdmin = !!user && holds(user, "settlement.read")
  const isFinance = !!user && holds(user, "settlement.create")
  const canDecide = !!user && holds(user, "settlement.approve:all")
  const canPayOut = !!user && holds(user, "settlement.pay:all")

  const settlementsQuery = useQuery({
    queryKey: ["settlements"],
    queryFn: () => listSettlements(accessToken!),
    enabled: isAuthed && isAdmin,
  })

  // Leavers with exit details recorded but no settlement yet.
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees(),
    enabled: isAuthed && isFinance,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["settlements"] })
    queryClient.invalidateQueries({ queryKey: ["employees"] })
  }

  function handleError(err: unknown) {
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
  }

  const calculateMutation = useMutation({
    mutationFn: (employeeId: string) => calculateSettlement(accessToken!, employeeId),
    onSuccess: (settlement) => {
      setError(null)
      setSelected(settlement)
      invalidate()
    },
    onError: handleError,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveSettlement(accessToken!, id),
    onSuccess: (settlement) => {
      setError(null)
      setSelected(settlement)
      invalidate()
    },
    onError: handleError,
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectSettlement(accessToken!, id, note),
    onSuccess: (settlement) => {
      setError(null)
      setRejecting(null)
      setSelected(settlement)
      invalidate()
    },
    onError: handleError,
  })

  const payMutation = useMutation({
    mutationFn: (id: string) => paySettlement(accessToken!, id),
    onSuccess: (settlement) => {
      setError(null)
      setSelected(settlement)
      invalidate()
    },
    onError: handleError,
  })

  if (!isAuthed) return <Skeleton className="h-64 w-full" />

  if (!isAdmin) {
    return (
      <>
        <PageHeader kicker="Workspace" title="Settlements" sub="Full and final" />
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
          You do not have access to settlements.
        </div>
      </>
    )
  }

  const settlements = settlementsQuery.data ?? []
  const settledIds = new Set(settlements.map((s) => s.employeeId))
  const awaiting = (employeesQuery.data ?? []).filter(
    (e) =>
      (e.employment?.employmentStatus === "RESIGNED" || e.employment?.employmentStatus === "TERMINATED") &&
      !settledIds.has(e.id)
  )

  const rows: TableCell[][] = settlements.map((s) => [
    { text: s.employee?.fullName ?? "—", sub: s.employee?.employeeCode, weight: 600 },
    { text: s.lastWorkingDay, sub: `${s.serviceYears} years` },
    { text: formatMoney(s.finalAmount, s.currency), weight: 600 },
    { tag: SETTLEMENT_STATUS_LABEL[s.status], tone: SETTLEMENT_STATUS_TONE[s.status] },
    {
      node: (
        <Button variant="link" className="h-auto p-0 text-[12.5px] font-semibold underline" onClick={() => setSelected(s)}>
          Open
        </Button>
      ),
    },
  ])

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Settlements"
        sub="Full and final settlements for leavers"
      />

      {error ? (
        <div className="mb-4 rounded-md border border-[#F0D9D9] bg-[#FDF6F6] px-5 py-3.5 text-[12.5px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      {selected ? (
        <SettlementDetail
          settlement={selected}
          onClose={() => setSelected(null)}
          canApprove={canDecide && selected.status === "DRAFT"}
          canPay={canPayOut && selected.status === "APPROVED"}
          canOverride={isFinance && selected.status === "DRAFT"}
          pending={approveMutation.isPending || payMutation.isPending || rejectMutation.isPending}
          onApprove={() => approveMutation.mutate(selected.id)}
          onReject={() => setRejecting(selected.id)}
          onPay={() => payMutation.mutate(selected.id)}
          onChanged={(next) => {
            setSelected(next)
            invalidate()
          }}
          onError={handleError}
        />
      ) : (
        <div className="space-y-6">
          {awaiting.length > 0 ? (
            <div className="rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
              <div className="text-[15px] font-bold">Leavers awaiting settlement</div>
              <ul className="mt-3 space-y-2">
                {awaiting.map((employee) => (
                  <li key={employee.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px]">
                        <span className="font-semibold">{employee.work.fullName}</span>{" "}
                        <span className="text-[#A5AFBE]">{employee.employment?.employeeCode}</span>
                      </div>
                      {isFinance ? (
                        <Button
                          variant="outline"
                          disabled={calculateMutation.isPending}
                          onClick={() => calculateMutation.mutate(employee.id)}
                        >
                          Calculate
                        </Button>
                      ) : null}
                    </div>
                    <ExitChecklistPanel employeeId={employee.id} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {settlementsQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : settlements.length === 0 ? (
            <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
              No settlements yet. One is created when an administrator calculates for a leaver.
            </div>
          ) : (
            <DataTable
              title="Settlements"
              cols="1.4fr 1.1fr 1fr 0.8fr 0.6fr"
              headers={["Employee", "Last working day", "Final amount", "Status", ""]}
              rows={rows}
              action={`${settlements.length} settlement${settlements.length === 1 ? "" : "s"}`}
            />
          )}
        </div>
      )}

      {rejecting ? (
        <DecisionDialog
          key={`stl-reject-${rejecting}`}
          open={!!rejecting}
          onOpenChange={(next) => !next && setRejecting(null)}
          title="Send this settlement back"
          confirmLabel="Reject"
          pending={rejectMutation.isPending}
          error={error}
          onConfirm={(note) => rejectMutation.mutate({ id: rejecting, note })}
        />
      ) : null}
    </>
  )
}
