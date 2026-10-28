import { AttendanceToday } from '@/modules/attendance/components/attendance-today';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="attendance.read:team"><AttendanceToday /></RequirePermission>; }
