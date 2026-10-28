'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImportWizard } from '@erp/ui/components/import-wizard';
import { PageHeader } from '@erp/ui/page';
import { saveDownload } from '@/lib/save-download';
import { commitImport, importTemplate, previewImport } from '@/modules/department/api';
import { useImportGuide } from '@/modules/department/hooks';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function ImportDepartmentsPage() {
  const router = useRouter();
  const guide = useImportGuide();

  return (
    <RequirePermission permission="department.import">
      <PageHeader kicker="Departments" title="Import departments" />
      <ImportWizard
        guide={guide.data}
        downloadTemplate={(format) => void importTemplate(format).then(saveDownload, (e: Error) => toast.error(e.message))}
        preview={previewImport}
        commit={commitImport}
        onDone={() => {
          toast.success('Departments imported');
          router.push('/departments');
        }}
      />
    </RequirePermission>
  );
}
