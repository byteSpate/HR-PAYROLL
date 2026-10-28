import { AttendanceConfig } from '@/modules/attendance/components/attendance-config';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="attendance.config"><AttendanceConfig kind="holidays" /></RequirePermission>; }
