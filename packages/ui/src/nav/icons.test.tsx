import { expect, it } from 'vitest';
import { RiCalendarLine, RiAddCircleLine, RiFileListLine, RiSettingsLine } from '@remixicon/react';
import { NavIcon } from './icons';
it('resolves every icon named by the leave manifest', () => {
  expect(NavIcon({ name: 'RiCalendarLine' }).type).toBe(RiCalendarLine);
  expect(NavIcon({ name: 'RiAddCircleLine' }).type).toBe(RiAddCircleLine);
  expect(NavIcon({ name: 'RiFileListLine' }).type).toBe(RiFileListLine);
  expect(NavIcon({ name: 'RiSettingsLine' }).type).toBe(RiSettingsLine);
});
