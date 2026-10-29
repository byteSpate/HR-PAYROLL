import { describe, expect, it } from 'vitest';
import { avatarUrlFor, packAvatar, publicIdOfAvatar } from './avatar.js';

describe('avatar helpers', () => {
  it('packs and unpacks the "publicId:version" form the database stores', () => {
    expect(packAvatar('hr/avatars/e1', 7)).toBe('hr/avatars/e1:7');
    expect(publicIdOfAvatar('hr/avatars/e1:7')).toBe('hr/avatars/e1');
  });

  it('degrades to no photo when nothing is stored or storage is not configured', () => {
    expect(avatarUrlFor(null)).toBeNull();
    expect(avatarUrlFor('hr/avatars/e1:7')).toBeNull();
  });
});
