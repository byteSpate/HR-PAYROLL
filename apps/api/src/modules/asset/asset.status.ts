import type { AssetComputedStatus, HeldBy, StatusInput } from './asset.types.js';

/**
 * The presented status of an asset.
 *
 * Only the lifecycle is stored, because only those three are decisions a person makes. "Assigned" and
 * "in repair" are facts about whether an open row exists: a stored status would mean somebody hands out a
 * laptop, forgets to flip a field, and the register lies with nothing able to detect it.
 *
 * RETIRED > LOST > IN_REPAIR > ASSIGNED > AVAILABLE, and custody is not collapsed into the word:
 * `heldBy` is returned alongside, so `{ status: 'IN_REPAIR', heldBy: {...} }` is a normal answer, not a contradiction.
 */
export function computeAssetStatus(input: StatusInput): {
  status: AssetComputedStatus;
  heldBy: HeldBy | null;
} {
  const heldBy = input.openAssignment;

  if (input.lifecycle === 'RETIRED') return { status: 'RETIRED', heldBy };
  if (input.lifecycle === 'LOST') return { status: 'LOST', heldBy };
  if (input.hasOpenRepair) return { status: 'IN_REPAIR', heldBy };
  if (heldBy) return { status: 'ASSIGNED', heldBy };
  return { status: 'AVAILABLE', heldBy: null };
}
