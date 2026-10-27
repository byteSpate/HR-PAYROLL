import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';

// Bcrypt cost 12, as used in HR-MNG-V1, so hashes stay comparable across the two apps.
const SALT_ROUNDS = 12;

// Ambiguous glyphs (0/O, 1/l/I) are left out so a temporary password can be read aloud or copied by hand.
const TEMP_PASSWORD_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTemporaryPassword(): string {
  return Array.from({ length: TEMP_PASSWORD_LENGTH }, () => TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)]).join('');
}
