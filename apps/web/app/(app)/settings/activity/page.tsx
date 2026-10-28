import { PageHeader } from '@erp/ui/page';
import { ActivityTable } from '@/modules/settings/components/activity-table';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function ActivityPage() {
  return (
    <RequirePermission permission="audit.read">
      <PageHeader kicker="Settings" title="Activity log" />
      <ActivityTable />
    </RequirePermission>
  );
}
