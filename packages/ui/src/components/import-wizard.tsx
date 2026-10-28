'use client';

import { useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

export interface ImportIssue {
  rowNumber: number;
  column?: string;
  message: string;
}

export interface ImportPreviewResult {
  rows: unknown[];
  issues: ImportIssue[];
  summary: Record<string, number>;
}

/** One row of the server's import guide (see buildImportGuide in @erp/export). */
export interface GuideRow {
  header: string;
  typeLabel: string;
  required: boolean;
  description: string;
  example: string;
}

/** A file is all-or-nothing on the server, so the button only opens for a clean preview. */
export const canCommit = (preview: ImportPreviewResult) => preview.issues.length === 0 && preview.rows.length > 0;

export function ImportPreviewView({
  preview,
  committing,
  onCommit,
  onReset,
}: {
  preview: ImportPreviewResult;
  committing: boolean;
  onCommit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {Object.entries(preview.summary)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ') || 'No rows found'}
      </p>
      {preview.issues.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">Fix these rows and upload the file again:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {preview.issues.map((i) => (
              <li key={`${i.rowNumber}-${i.column ?? ''}-${i.message}`}>
                Row {i.rowNumber}
                {i.column ? ` (${i.column})` : ''}: {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={onCommit} disabled={!canCommit(preview) || committing}>
          {committing ? 'Importing...' : 'Import'}
        </Button>
        <Button variant="outline" onClick={onReset} disabled={committing}>
          Choose another file
        </Button>
      </div>
    </div>
  );
}

export interface ImportWizardProps {
  guide: GuideRow[] | undefined;
  downloadTemplate: (format: 'xlsx' | 'csv') => void;
  preview: (file: File) => Promise<ImportPreviewResult>;
  commit: (file: File) => Promise<unknown>;
  onDone: () => void;
}

/** Guide, template, upload, per-row preview, then commit: the same steps for every importer. */
export function ImportWizard({ guide, downloadTemplate, preview, commit, onDone }: ImportWizardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">1. Get the template</h2>
        {guide ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>What to write</TableHead>
                <TableHead>Example</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guide.map((g) => (
                <TableRow key={g.header}>
                  <TableCell className="font-mono">{g.header}</TableCell>
                  <TableCell>{g.typeLabel}</TableCell>
                  <TableCell>{g.required ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{g.description}</TableCell>
                  <TableCell>{g.example}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadTemplate('xlsx')}>
            Download Excel template
          </Button>
          <Button variant="outline" onClick={() => downloadTemplate('csv')}>
            Download CSV template
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">2. Upload and check</h2>
        {result && file ? (
          <ImportPreviewView
            preview={result}
            committing={busy}
            onReset={reset}
            onCommit={() =>
              run(async () => {
                await commit(file);
                reset();
                onDone();
              })
            }
          />
        ) : (
          <Input
            type="file"
            accept=".xlsx,.csv"
            disabled={busy}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (!chosen) return;
              setFile(chosen);
              void run(async () => setResult(await preview(chosen)));
            }}
          />
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>
    </div>
  );
}
