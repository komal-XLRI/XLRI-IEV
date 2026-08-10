import { describe, expect, it } from 'vitest';
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  EVIDENCE_ACCEPT_ATTRIBUTE,
  EVIDENCE_FORMAT_GROUPS,
  MAX_EVIDENCE_FILE_BYTES,
  evidenceMimeTypeFor,
  isAllowedEvidenceMimeType,
  resourceTypeForMime,
} from '@/lib/constants/uploads';
import { requestUploadSignatureSchema } from '@/validators/submissions';

const studentVentureActivityId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('evidence file policy', () => {
  it('accepts the documented types', () => {
    expect(isAllowedEvidenceMimeType('application/pdf')).toBe(true);
    expect(isAllowedEvidenceMimeType('image/png')).toBe(true);
    expect(isAllowedEvidenceMimeType('image/webp')).toBe(true);
    expect(isAllowedEvidenceMimeType('video/mp4')).toBe(true);
    expect(isAllowedEvidenceMimeType('video/quicktime')).toBe(true);
    expect(isAllowedEvidenceMimeType('video/webm')).toBe(true);
  });

  it('rejects executables and scripts', () => {
    expect(isAllowedEvidenceMimeType('application/x-msdownload')).toBe(false);
    expect(isAllowedEvidenceMimeType('text/html')).toBe(false);
    expect(isAllowedEvidenceMimeType('application/javascript')).toBe(false);
  });

  it('routes each type to the right Cloudinary bucket', () => {
    expect(resourceTypeForMime('image/jpeg')).toBe('image');
    expect(resourceTypeForMime('video/mp4')).toBe('video');
    expect(resourceTypeForMime('video/webm')).toBe('video');
    expect(resourceTypeForMime('application/pdf')).toBe('raw');
  });
});

describe('what the student is told is accepted', () => {
  // The advertised list and the enforced list drift apart the moment someone
  // edits one of them, and the failure is silent: a file the picker offered is
  // refused by the server, which reads as a broken upload.
  it('advertises only formats the server will accept', () => {
    for (const group of EVIDENCE_FORMAT_GROUPS) {
      for (const extension of group.extensions) {
        expect(
          evidenceMimeTypeFor(`evidence.${extension.toLowerCase()}`, ''),
          `${extension} is offered to students but maps to no accepted MIME type`,
        ).not.toBeNull();
      }
    }
  });

  it('advertises every format the server accepts', () => {
    const advertised = new Set(
      EVIDENCE_FORMAT_GROUPS.flatMap((group) =>
        group.extensions.map((extension) =>
          evidenceMimeTypeFor(`x.${extension.toLowerCase()}`, ''),
        ),
      ),
    );

    for (const mimeType of ALLOWED_EVIDENCE_MIME_TYPES) {
      // text/csv and text/plain are accepted but not worth listing as a format
      // a student would go looking for.
      if (mimeType.startsWith('text/')) continue;
      expect(advertised, `${mimeType} is accepted but never shown`).toContain(mimeType);
    }
  });

  it('offers the file picker both MIME types and extensions', () => {
    // Windows reports an empty type for .mov and .webm often enough that a
    // MIME-only filter hides files the server would accept.
    expect(EVIDENCE_ACCEPT_ATTRIBUTE).toContain('video/quicktime');
    expect(EVIDENCE_ACCEPT_ATTRIBUTE).toContain('.mov');
    expect(EVIDENCE_ACCEPT_ATTRIBUTE).toContain('.webm');
  });
});

describe('resolving the type of a chosen file', () => {
  it('trusts a type the browser reports and we accept', () => {
    expect(evidenceMimeTypeFor('deck.pdf', 'application/pdf')).toBe('application/pdf');
  });

  it('falls back to the extension when the browser reports nothing', () => {
    expect(evidenceMimeTypeFor('demo.mov', '')).toBe('video/quicktime');
    expect(evidenceMimeTypeFor('clip.webm', '')).toBe('video/webm');
    expect(evidenceMimeTypeFor('PHOTO.JPEG', '')).toBe('image/jpeg');
  });

  it('overrides a reported type we do not accept', () => {
    // Some systems label a .mov as application/octet-stream.
    expect(evidenceMimeTypeFor('demo.mov', 'application/octet-stream')).toBe('video/quicktime');
  });

  it('refuses a file it cannot place', () => {
    expect(evidenceMimeTypeFor('installer.exe', 'application/x-msdownload')).toBeNull();
    expect(evidenceMimeTypeFor('page.html', 'text/html')).toBeNull();
    expect(evidenceMimeTypeFor('noextension', '')).toBeNull();
  });
});

describe('upload signature request validation', () => {
  const valid = {
    studentVentureActivityId,
    fileName: 'market-research.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
  };

  it('accepts a well-formed request', () => {
    expect(requestUploadSignatureSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a disallowed file type', () => {
    const result = requestUploadSignatureSchema.safeParse({ ...valid, fileType: 'text/html' });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized file', () => {
    const result = requestUploadSignatureSchema.safeParse({
      ...valid,
      fileSize: MAX_EVIDENCE_FILE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero-byte file', () => {
    expect(requestUploadSignatureSchema.safeParse({ ...valid, fileSize: 0 }).success).toBe(false);
  });

  it('rejects a malformed activity record id', () => {
    expect(
      requestUploadSignatureSchema.safeParse({
        ...valid,
        studentVentureActivityId: 'not-an-id',
      }).success,
    ).toBe(false);
  });

  it('is scoped to the activity record, not to a submission', () => {
    // Evidence has to be attachable before the attempt exists; a
    // submission-scoped signature cannot express that.
    const withSubmission = requestUploadSignatureSchema.safeParse({
      submissionId: studentVentureActivityId,
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 10,
    });
    expect(withSubmission.success).toBe(false);
  });
});
