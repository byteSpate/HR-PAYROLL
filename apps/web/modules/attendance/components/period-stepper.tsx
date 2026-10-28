"use client"

import { useState } from "react"
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react"

import { Button } from "@erp/ui/components/button"
import { currentMonth, formatMonthLabel } from "./attendance-shared"

/**
 * The month the attendance pages are looking at. HR-MNG-V1 kept this inline in its one attendance
 * page; here each page is its own route, so the state and the stepper are shared instead of pasted.
 */
export function usePeriod() {
  const [{ month, year }, setPeriod] = useState(currentMonth)

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1)
    setPeriod({ month: next.getMonth() + 1, year: next.getFullYear() })
  }

  return { month, year, shiftMonth }
}

export function PeriodStepper({
  month,
  year,
  shiftMonth,
}: {
  month: number
  year: number
  shiftMonth: (delta: number) => void
}) {
  return (
    // A group, not two loose buttons: the label between them is the
    // control's value, so it is announced with them rather than read as
    // stray text sitting between two arrows.
    <div
      role="group"
      aria-label="Month shown"
      className="flex items-center gap-0.5 rounded-md border border-[#E4E9EF] bg-white p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        aria-label="Previous month"
        onClick={() => shiftMonth(-1)}
        className="size-8 rounded p-0 text-[#5F6B7C] hover:bg-[#F1F4F8] hover:text-[#1C2733]"
      >
        <RiArrowLeftSLine className="size-4" aria-hidden />
      </Button>
      <span aria-live="polite" className="min-w-[130px] text-center text-[13px] font-bold">
        {formatMonthLabel(month, year)}
      </span>
      <Button
        type="button"
        variant="ghost"
        aria-label="Next month"
        onClick={() => shiftMonth(1)}
        className="size-8 rounded p-0 text-[#5F6B7C] hover:bg-[#F1F4F8] hover:text-[#1C2733]"
      >
        <RiArrowRightSLine className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
