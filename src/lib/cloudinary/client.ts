import 'server-only';
import { v2 as cloudinary } from 'cloudinary';
import { env, isCloudinaryConfigured } from '@/config/env';
import { AppError } from '@/lib/errors';

let configured = false;

/**
 * Cloudinary credentials stay on the server. The browser only ever receives a
 * short-lived signature scoped to one folder and public_id.
 */
export function getCloudinary() {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      503,
      'CLOUDINARY_NOT_CONFIGURED',
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env().CLOUDINARY_CLOUD_NAME,
      api_key: env().CLOUDINARY_API_KEY,
      api_secret: env().CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export function uploadFolder(): string {
  return env().CLOUDINARY_UPLOAD_FOLDER;
}

export function cloudName(): string {
  getCloudinary();
  return env().CLOUDINARY_CLOUD_NAME!;
}

export function apiKey(): string {
  getCloudinary();
  return env().CLOUDINARY_API_KEY!;
}
