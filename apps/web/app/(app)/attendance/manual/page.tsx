import { ManualPage } from '@/modules/attendance/components/manual-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';
export default function Page() { return <RequirePermission permission="attendance.manage:department"><ManualPage /></RequirePermission>; }
