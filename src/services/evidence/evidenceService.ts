import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Evidence, StudentVenture, StudentVentureActivity } from '@/models';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isAssignedReviewer, reviewerTypeForRole } from '@/lib/permissions/reviewAccess';
import type { Role } from '@/lib/constants/roles';
import { signedAssetUrl } from '@/lib/cloudinary/signing';

/**
 * Who may open one evidence file.
 *
 * The same four rules the rest of the application already runs on: a student
 * sees their own venture, an assigned reviewer sees the venture they review,
 * an administrator sees everything, and nobody else sees anything. Being
 * faculty somewhere in the programme is not enough.
 */
async function authoriseViewer(
  studentVentureActivityId: string,
  viewer: { userId: string; role: Role },
) {
  if (viewer.role === 'ADMIN') return;

  const record = await StudentVentureActivity.findById(studentVentureActivityId).lean().exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const venture = await StudentVenture.findById(record.studentVentureId).lean().exec();
  if (!venture) throw new NotFoundError('Venture not found');

  if (viewer.role === 'STUDENT') {
    if (venture.studentId.toString() !== viewer.userId) {
      throw new ForbiddenError('This file does not belong to you');
    }
    return;
  }

  const reviewerType = reviewerTypeForRole(viewer.role);
  if (!reviewerType || !isAssignedReviewer(venture, viewer.userId, reviewerType)) {
    throw new ForbiddenError('You are not the assigned reviewer for this venture');
  }
}

export interface EvidenceLink {
  url: string;
  fileName: string;
}

/**
 * Authorises the viewer and returns a short-lived link to the file.
 *
 * The stored `fileUrl` is deliberately not what anyone is sent to: the account
 * refuses to deliver PDFs over a public URL, and a public URL would outlive
 * the reader's right to read it in any case.
 */
export async function resolveEvidenceLink(
  evidenceId: string,
  viewer: { userId: string; role: Role },
  options: { download?: boolean } = {},
): Promise<EvidenceLink> {
  await connectToDatabase();

  const evidence = await Evidence.findById(evidenceId).lean().exec();
  if (!evidence) throw new NotFoundError('Evidence not found');

  await authoriseViewer(evidence.studentVentureActivityId.toString(), viewer);

  return {
    url: signedAssetUrl({
      publicId: evidence.publicId,
      resourceType: evidence.resourceType,
      download: options.download,
    }),
    fileName: evidence.fileName,
  };
}
