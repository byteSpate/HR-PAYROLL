import { afterEach, describe, expect, it } from 'vitest';
import { getStorage, memoryStorage, requireStorage, setStorageForTests } from './index.js';

const file = { buffer: Buffer.from('hello'), originalname: 'note.pdf', mimetype: 'application/pdf' };

afterEach(() => setStorageForTests(undefined));

describe('memoryStorage', () => {
  it('round-trips upload, signed url and remove', async () => {
    const s = memoryStorage();
    const stored = await s.upload(file, 'docs/e1');
    expect(stored).toMatchObject({ bytes: 5, format: 'pdf', fileName: 'note.pdf' });
    expect(stored.publicId.startsWith('docs/e1/')).toBe(true);
    expect(s.signedUrl(stored.publicId)).toContain(stored.publicId);

    await s.remove(stored.publicId);
    expect(() => s.signedUrl(stored.publicId)).toThrow();
  });

  it('gives every upload its own id', async () => {
    const s = memoryStorage();
    const a = await s.upload(file, 'docs');
    const b = await s.upload(file, 'docs');
    expect(a.publicId).not.toBe(b.publicId);
  });
});

describe('getStorage', () => {
  it('is null when Cloudinary is not configured', () => {
    expect(getStorage({})).toBeNull();
  });

  it('is configured only when all three settings are present', () => {
    expect(getStorage({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k' })).toBeNull();
    expect(getStorage({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' })).not.toBeNull();
  });

  it('returns the test override when one is set', () => {
    const s = memoryStorage();
    setStorageForTests(s);
    expect(getStorage({})).toBe(s);
  });
});

describe('requireStorage', () => {
  it('throws a 503 when storage is not configured', () => {
    setStorageForTests(null);
    expect(() => requireStorage()).toThrow(expect.objectContaining({ status: 503, message: 'File storage is not configured' }));
  });
});
