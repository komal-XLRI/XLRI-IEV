/** Evidence upload policy. Enforced server-side before any Cloudinary signature is issued. */
export const MAX_EVIDENCE_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type AllowedEvidenceMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];

export const MAX_EVIDENCE_FILES_PER_SUBMISSION = 10;

/**
 * The accepted formats, grouped the way a student thinks about them.
 *
 * Extensions rather than MIME types, because a MIME type is not something a
 * student has an opinion about — and because the two lists have different jobs:
 * this one is read, `ALLOWED_EVIDENCE_MIME_TYPES` is enforced.
 */
export const EVIDENCE_FORMAT_GROUPS = [
  { label: 'Documents', extensions: ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX'] },
  { label: 'Images', extensions: ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'] },
  { label: 'Video', extensions: ['MP4', 'MOV', 'WEBM'] },
] as const;

/**
 * The `accept` attribute for the file picker.
 *
 * Extensions are listed alongside the MIME types deliberately. Windows reports
 * an empty `type` for .mov and .webm often enough that a MIME-only filter hides
 * files the server would happily accept, which reads as a broken picker.
 */
export const EVIDENCE_ACCEPT_ATTRIBUTE = [
  ...ALLOWED_EVIDENCE_MIME_TYPES,
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.csv',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp4',
  '.mov',
  '.webm',
].join(',');

/** Cloudinary resource buckets we accept. */
export const CLOUDINARY_RESOURCE_TYPES = ['image', 'video', 'raw'] as const;
export type CloudinaryResourceType = (typeof CLOUDINARY_RESOURCE_TYPES)[number];

export function resourceTypeForMime(mimeType: string): CloudinaryResourceType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

export function isAllowedEvidenceMimeType(value: string): value is AllowedEvidenceMimeType {
  return (ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(value);
}

/** Extension → MIME, for the browsers that hand us a file with no `type`. */
const EXTENSION_MIME_TYPES: Record<string, AllowedEvidenceMimeType> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/**
 * The MIME type to upload a file as.
 *
 * Trusts the browser when it says something we accept, and falls back to the
 * extension when it says nothing — which Windows does routinely for .mov and
 * .webm. Returns null when neither is recognised, and the caller rejects it.
 *
 * This only decides what the client *claims*; the server re-checks the value
 * against the same list before it will sign anything.
 */
export function evidenceMimeTypeFor(fileName: string, reportedType: string): string | null {
  if (isAllowedEvidenceMimeType(reportedType)) return reportedType;

  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();
  return (extension && EXTENSION_MIME_TYPES[extension]) ?? null;
}
