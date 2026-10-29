import multer, { MulterError } from 'multer';
import type { RequestHandler } from 'express';
import { AppError } from '@erp/utils';
import { requireStorage } from './storage.js';

export interface UploadLimits {
  maxBytes: number;
  mimeTypes: string[];
}

/** One file from `field`, kept in memory; size and type failures become 413 / 415 AppErrors. */
export function uploadSingle(field: string, limits: UploadLimits): RequestHandler {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits.maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (limits.mimeTypes.includes(file.mimetype)) return cb(null, true);
      cb(new AppError(415, `Only ${limits.mimeTypes.join(', ')} files are accepted`));
    },
  }).single(field);

  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = Math.max(1, Math.round(limits.maxBytes / 1024 / 1024));
          return next(new AppError(413, `That file is larger than ${mb} MB`));
        }
        return next(new AppError(400, `Send exactly one file, in a \`${field}\` field`));
      }
      return next(err);
    });
  };
}

/** Run before the upload handler, so a server with no file storage answers 503 at once instead of after buffering the file. */
export const storageReady: RequestHandler = (_req, _res, next) => {
  requireStorage();
  next();
};
