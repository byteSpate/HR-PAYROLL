import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './passwords.js';

describe('passwords', () => {
  it('verifies the original password against its hash only', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('generates temporary passwords of at least 12 characters', () => {
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(12);
  });

  it('generates a different temporary password each time', () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
