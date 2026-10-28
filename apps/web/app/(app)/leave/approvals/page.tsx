import { LeaveList } from '@/modules/leave/components/leave-list';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="leave.approve:team"><LeaveList mode="approvals" /></RequirePermission>; }
