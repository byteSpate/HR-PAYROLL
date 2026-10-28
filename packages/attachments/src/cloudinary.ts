import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '@erp/utils';
import { DEFAULT_URL_TTL_SECONDS, extensionOf, newPublicId, type AttachmentStorage } from './storage.js';

// Ported from HR-MNG-V1 media.provider/media.service. Every asset is `authenticated`, so it is only
// reachable through a URL this server signs. PDFs are stored as Cloudinary "image" resources too,
// which is what lets private_download_url serve them.
export function cloudinaryStorage(creds: { cloud: string; key: string; secret: string }): AttachmentStorage {
  const client = () => {
    cloudinary.config({ cloud_name: creds.cloud, api_key: creds.key, api_secret: creds.secret, secure: true });
    return cloudinary;
  };

  return {
    upload(file, folder) {
      const publicId = newPublicId(folder);
      return new Promise((resolve, reject) => {
        const stream = client().uploader.upload_stream(
          { public_id: publicId, type: 'authenticated', resource_type: 'image', overwrite: true, invalidate: true },
          (error, result) => {
            if (error || !result) {
              console.error('Cloudinary upload failed', error);
              return reject(new AppError(502, 'Upload to the file store failed. Please try again.'));
            }
            resolve({
              publicId: result.public_id,
              version: result.version,
              bytes: result.bytes,
              format: result.format ?? extensionOf(file.originalname),
              fileName: file.originalname,
            });
          },
        );
        stream.end(file.buffer);
      });
    },

    signedUrl(publicId, opts = {}) {
      if (opts.format) {
        const expiresAt = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? DEFAULT_URL_TTL_SECONDS);
        return client().utils.private_download_url(publicId, opts.format, {
          type: 'authenticated',
          resource_type: 'image',
          expires_at: expiresAt,
        });
      }
      return client().url(publicId, {
        type: 'authenticated',
        resource_type: 'image',
        sign_url: true,
        secure: true,
        ...(opts.version === undefined ? {} : { version: opts.version }),
      });
    },

    async remove(publicId) {
      // A failed delete leaves an unreachable orphan; it must not fail the user's action.
      try {
        await client().uploader.destroy(publicId, { type: 'authenticated', resource_type: 'image', invalidate: true });
      } catch (err) {
        console.error('Failed to delete Cloudinary asset', publicId, err);
      }
    },
  };
}
