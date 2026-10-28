'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { documentTypes } from '@erp/contracts/employee';
import { Button } from '@erp/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@erp/ui/components/card';
import { Input } from '@erp/ui/components/input';
import { documentUrl } from '../api';
import { useDeleteDocument, useDocuments, useUploadDocument } from '../hooks';
import { humanize } from '../labels';

export function DocumentsPanel({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const docs = useDocuments(employeeId);
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const [type, setType] = useState<string>('CONTRACT');

  // The 403 for colleagues is expected: they simply do not get this panel.
  if (docs.error) return null;

  const open = async (docId: string) => {
    try {
      window.open((await documentUrl(employeeId, docId)).url, '_blank', 'noopener');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.data?.length ? (
          <ul className="divide-y text-sm">
            {docs.data.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <button type="button" className="text-left hover:underline" onClick={() => open(d.id)}>
                  {humanize(d.type)}: {d.fileName}
                </button>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      remove.mutateAsync({ id: employeeId, docId: d.id }).catch((e: Error) => toast.error(e.message))
                    }
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        )}
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Document type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {documentTypes.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="max-w-xs"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                upload
                  .mutateAsync({ id: employeeId, type, file })
                  .then(() => toast.success('Document uploaded'), (err: Error) => toast.error(err.message));
                e.target.value = '';
              }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
