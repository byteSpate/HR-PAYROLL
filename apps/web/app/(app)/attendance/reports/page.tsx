import { AttendanceReport } from '@/modules/attendance/components/attendance-report';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="attendance.report:team"><AttendanceReport /></RequirePermission>; }
