import { AttendanceApprovals } from '@/modules/attendance/components/attendance-approvals';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="attendance.approve:team"><AttendanceApprovals /></RequirePermission>; }
