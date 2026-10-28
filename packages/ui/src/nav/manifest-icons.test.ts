import { describe, expect, it } from 'vitest';
import { modules } from '@erp/contracts';
import { icons } from '../dashboard/icons';

// The sidebar looks icons up by name in one registry, and an unknown name silently falls back to a
// plain circle, so a typo in a manifest would ship unnoticed. This catches it.
describe('manifest nav icons', () => {
  const named = modules.flatMap((m) => m.nav.flatMap((g) => g.items.map((i) => ({ module: m.name, label: i.label, icon: i.icon }))));

  it('names an icon for every sidebar item', () => {
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((i) => !i.icon)).toEqual([]);
  });

  it('only names icons the shared registry has', () => {
    const missing = named.filter((i) => !(i.icon in icons));
    expect(missing).toEqual([]);
  });
});
