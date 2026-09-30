import type { StudentActivityStatus } from '@/lib/constants/status';
import type { PresentationStatus } from '@/lib/constants/presentations';

/**
 * Mentor feedback on presentations.
 *
 * The presentation status is the single source of truth for whether feedback
 * is possible at all. Nothing is stored that says "this QR is active": every
 * check — generating a QR, following one, accepting a response — asks this
 * function about the record as it is right now. Unticking a presentation
 * therefore switches its link off at once, and ticking it again switches the
 * same link back on.
 */
export function isPresentationReceived(record: {
  presentationReceivedAt?: Date | string | null;
  status: StudentActivityStatus;
}): boolean {
  return record.presentationReceivedAt != null || record.status === 'COMPLETED';
}

/**
 * Whether one student's presentation in one sitting was received — the only
 * thing a feedback QR, its link and an incoming response are checked against.
 * A cancelled sitting has no received students, whatever their marks say, so
 * cancelling one switches every link in it off and restoring it switches them
 * back on.
 */
export function isParticipantReceived(
  participant: { receivedAt?: Date | string | null },
  presentation: { status: PresentationStatus },
): boolean {
  return participant.receivedAt != null && presentation.status !== 'CANCELLED';
}

export const DEFAULT_REQUIRED_FEEDBACK_COUNT = 1;
export const MAX_REQUIRED_FEEDBACK_COUNT = 10;

/** Feedback is complete only on a received presentation with enough counted responses. */
export function isFeedbackComplete(input: {
  received: boolean;
  countedResponses: number;
  requiredFeedbackCount: number;
}): boolean {
  return input.received && input.countedResponses >= Math.max(1, input.requiredFeedbackCount);
}

/**
 * Who a response is attributed to for duplicate handling. With an email the
 * mentor is that email; without one there is no way to tell two responses'
 * authors apart, so each response stands for itself.
 */
export function mentorKey(response: { mentorEmail?: string | null; googleResponseId: string }) {
  const email = response.mentorEmail?.trim().toLowerCase();
  return email ? `email:${email}` : `response:${response.googleResponseId}`;
}

/**
 * Among one mentor's responses on one participant, only the latest counts;
 * the rest are superseded. Returns the ids to mark superseded.
 */
export function supersededResponseIds<
  T extends {
    id: string;
    submittedAt: Date;
    mentorEmail?: string | null;
    googleResponseId: string;
  },
>(responses: readonly T[]): Set<string> {
  const latestByMentor = new Map<string, T>();
  for (const response of responses) {
    const key = mentorKey(response);
    const current = latestByMentor.get(key);
    if (
      !current ||
      response.submittedAt.getTime() > current.submittedAt.getTime() ||
      (response.submittedAt.getTime() === current.submittedAt.getTime() &&
        response.googleResponseId > current.googleResponseId)
    ) {
      latestByMentor.set(key, response);
    }
  }

  const keep = new Set([...latestByMentor.values()].map((r) => r.id));
  return new Set(responses.filter((r) => !keep.has(r.id)).map((r) => r.id));
}

/**
 * Stage-level feedback figures. The denominator is received presentations
 * only — a student who has not presented cannot be owed feedback.
 */
export function feedbackTally(
  records: ReadonlyArray<{ received: boolean; countedResponses: number }>,
  requiredFeedbackCount: number,
) {
  const received = records.filter((r) => r.received);
  return {
    total: records.length,
    received: received.length,
    complete: received.filter((r) =>
      isFeedbackComplete({
        received: true,
        countedResponses: r.countedResponses,
        requiredFeedbackCount,
      }),
    ).length,
    responses: received.reduce((sum, r) => sum + r.countedResponses, 0),
  };
}
