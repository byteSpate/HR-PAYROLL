"use client"

import { useState } from "react"
import { RiUpload2Line } from "@remixicon/react"

import { ExportMenu } from "@/components/import-export/export-menu"
import { ImportDialog, type PreviewColumn } from "@/components/import-export/import-dialog"
import { Button } from "@erp/ui/components/button"
import type { QueryValue } from "@/lib/api/import-export"

/**
 * The Export menu and, where the list can be imported, the Import button and
 * window. Shown only to those who may use them: the page passes `allowed`, computed
 * from the same permission the server routes check, because a button the server
 * would refuse is a bug.
 */
export function ImportExportTools({
  basePath,
  fileName,
  allowed,
  exportParams,
  exportDisabled,
  exportNote,
  onError,
  importer,
}: {
  basePath: string
  fileName: string
  allowed: boolean
  exportParams?: Record<string, QueryValue>
  exportDisabled?: boolean
  exportNote?: string
  onError?: (message: string) => void
  /** Leave out for a list that can be exported but not imported. */
  importer?: {
    title: string
    /** Singular, like `supplier`. */
    noun: string
    previewColumns: PreviewColumn[]
    summaryText: (summary: Record<string, number>) => string
    onImported: () => void
  }
}) {
  const [importOpen, setImportOpen] = useState(false)

  if (!allowed) return null

  return (
    <div className="flex flex-wrap items-start gap-2">
      {importer ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <RiUpload2Line className="size-4" aria-hidden />
          Import
        </Button>
      ) : null}
      <ExportMenu
        basePath={basePath}
        fileName={fileName}
        params={exportParams}
        disabled={exportDisabled}
        note={exportNote}
        onError={onError}
      />
      {importer && importOpen ? (
        <ImportDialog
          title={importer.title}
          noun={importer.noun}
          basePath={basePath}
          previewColumns={importer.previewColumns}
          summaryText={importer.summaryText}
          onImported={importer.onImported}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
    </div>
  )
}
