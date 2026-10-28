import { createElement, type ComponentType } from 'react';
import {
  RiCircleLine,
  RiCalendarLine,
  RiAddCircleLine,
  RiFileListLine,
  RiSettingsLine,
  RiIdCardLine,
  RiGroupLine,
  RiUserAddLine,
  RiTeamLine,
  RiContactsBook2Line,
  RiUserSmileLine,
  RiUploadLine,
  RiListUnordered,
  RiBuilding2Line,
  RiDashboardLine,
  RiSettings3Line,
  RiHistoryLine,
  RiShieldUserLine,
  RiUserLine,
  RiTimeLine,
  RiCalendarCheckLine,
  RiCheckboxCircleLine,
  RiEditLine,
  RiBarChartLine,
  RiTimerLine,
  RiCalendarEventLine,
} from '@remixicon/react';

type IconComponent = ComponentType<{ className?: string }>;

// Explicit registry (not `import *`) so the bundle only carries icons modules actually name.
// Add an entry here when a module manifest introduces a new icon name.
const ICONS: Record<string, IconComponent> = {
  RiCalendarLine,
  RiAddCircleLine,
  RiFileListLine,
  RiSettingsLine,
  RiIdCardLine,
  RiGroupLine,
  RiUserAddLine,
  RiTeamLine,
  RiContactsBook2Line,
  RiUserSmileLine,
  RiUploadLine,
  RiListUnordered,
  RiBuilding2Line,
  RiDashboardLine,
  RiSettings3Line,
  RiHistoryLine,
  RiShieldUserLine,
  RiUserLine,
  RiTimeLine,
  RiCalendarCheckLine,
  RiCheckboxCircleLine,
  RiEditLine,
  RiBarChartLine,
  RiTimerLine,
  RiCalendarEventLine,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  return createElement(ICONS[name] ?? RiCircleLine, { className });
}
