import { LeavePage } from '@/modules/leave/components/leave-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission="leave.read:team">
      <LeavePage section="requests" />
    </RequirePermission>
  );
}
