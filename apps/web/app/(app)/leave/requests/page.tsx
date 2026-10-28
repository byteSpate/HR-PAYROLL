import { LeaveList } from '@/modules/leave/components/leave-list';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="leave.read:team"><LeaveList mode="team" /></RequirePermission>; }
