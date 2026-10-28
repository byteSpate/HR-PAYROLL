import { ActivityTable } from '@/modules/settings/components/activity-table';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function ActivityPage() {
  return (
    <RequirePermission permission="audit.read">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight">Activity Log</h1>
      <ActivityTable />
    </RequirePermission>
  );
}
