import 'server-only';
import { apiKey, cloudName, getCloudinary, uploadFolder } from './client';
import { type CloudinaryResourceType } from '@/lib/constants/uploads';

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
  uploadUrl: string;
}

/**
 * Signs a single upload. The signature covers `folder` and `public_id`, so a
 * client cannot redirect the upload elsewhere in the account or overwrite
 * another student's evidence.
 */
export function signUpload(params: {
  publicId: string;
  resourceType: CloudinaryResourceType;
}): UploadSignature {
  const client = getCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = uploadFolder();

  const signature = client.utils.api_sign_request(
    { folder, public_id: params.publicId, timestamp },
    client.config().api_secret as string,
  );

  return {
    signature,
    timestamp,
    apiKey: apiKey(),
    cloudName: cloudName(),
    folder,
    publicId: params.publicId,
    resourceType: params.resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName()}/${params.resourceType}/upload`,
  };
}

/**
 * Re-derives the signature Cloudinary returned for a completed upload. If it
 * does not match, the client fabricated the callback and the evidence record
 * must not be written.
 */
export function verifyUploadResponse(params: {
  publicId: string;
  version: number;
  signature: string;
}): boolean {
  const client = getCloudinary();
  const expected = client.utils.api_sign_request(
    { public_id: params.publicId, version: params.version },
    client.config().api_secret as string,
  );
  return expected === params.signature;
}

export async function deleteUpload(
  publicId: string,
  resourceType: CloudinaryResourceType,
): Promise<void> {
  const client = getCloudinary();
  await client.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
}

/**
 * Unguessable public id, prefixed with the scope it was signed for.
 *
 * The prefix is what the server re-checks on the way back in, so a client
 * cannot present an asset from one student's activity as another's. The nonce
 * is what stops two files of the same name colliding.
 */
export function buildPublicId(scopeId: string, fileName: string): string {
  const safe = fileName
    .replace(/\.[^./\\]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 60);
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${scopeId}/${nonce}-${safe || 'evidence'}`;
}
