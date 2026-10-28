import { LeaveTypes } from '@/modules/leave/components/leave-types';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="leave.config"><LeaveTypes /></RequirePermission>; }
