import { randomUUID } from 'node:crypto';
import { AppError } from '@erp/utils';
import { cloudinaryStorage } from './cloudinary.js';

export interface StoredFile {
  publicId: string;
  version: number;
  bytes: number;
  format: string;
  fileName: string;
}

export interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface SignedUrlOptions {
  version?: number;
  /**
   * Known for documents (pdf, png...): the URL then expires after `expiresInSeconds`. Avatars omit it
   * and get a signed delivery URL that never expires, because they are shown on every page.
   */
  format?: string;
  expiresInSeconds?: number;
}

export interface AttachmentStorage {
  upload(file: UploadFile, folder: string): Promise<StoredFile>;
  signedUrl(publicId: string, opts?: SignedUrlOptions): string;
  remove(publicId: string): Promise<void>;
}

export const DEFAULT_URL_TTL_SECONDS = 300;

type StorageEnv = Partial<Record<'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET', string>>;

// undefined = no override; null = force "not configured" (tests of the 503 path).
let override: AttachmentStorage | null | undefined;

export function setStorageForTests(storage: AttachmentStorage | null | undefined): void {
  override = storage;
}

/** Null when Cloudinary is not configured; callers degrade (no avatars) instead of failing reads. */
export function getStorage(env: StorageEnv = process.env as StorageEnv): AttachmentStorage | null {
  if (override !== undefined) return override;
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env;
  return cloud && key && secret ? cloudinaryStorage({ cloud, key, secret }) : null;
}

export function requireStorage(): AttachmentStorage {
  const storage = getStorage();
  if (!storage) throw new AppError(503, 'File storage is not configured');
  return storage;
}

export const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
};

export const newPublicId = (folder: string) => `${folder.replace(/\/+$/, '')}/${randomUUID()}`;

/** In-process storage for tests and local runs without Cloudinary. */
export function memoryStorage(): AttachmentStorage {
  const files = new Map<string, StoredFile>();
  return {
    async upload(file, folder) {
      const stored: StoredFile = {
        publicId: newPublicId(folder),
        version: 1,
        bytes: file.buffer.length,
        format: extensionOf(file.originalname),
        fileName: file.originalname,
      };
      files.set(stored.publicId, stored);
      return stored;
    },
    signedUrl(publicId) {
      if (!files.has(publicId)) throw new AppError(404, 'File not found');
      return `memory://${publicId}`;
    },
    async remove(publicId) {
      files.delete(publicId);
    },
  };
}
