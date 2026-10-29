import { getStorage } from './storage.js';

// Avatars are stored as "publicId:version". A missing or unconfigured store degrades a photo to
// initials, never to an error.
export const packAvatar = (publicId: string, version: number) => `${publicId}:${version}`;
export const publicIdOfAvatar = (packed: string) => packed.split(':')[0]!;

export function avatarUrlFor(packed: string | null): string | null {
  const storage = getStorage();
  if (!packed || !storage) return null;
  const [publicId, version] = packed.split(':');
  return storage.signedUrl(publicId!, version ? { version: Number(version) } : {});
}
