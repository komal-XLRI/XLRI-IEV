/**
 * Presentation instances.
 *
 * A stage (venture activity) is presented in as many sittings as the programme
 * office schedules — one presentation per date, each with its own students,
 * its own Drive link and its own mentor feedback. The status here is the
 * sitting's own; whether each student actually presented is recorded per
 * student, on the participant.
 */
export const PRESENTATION_STATUSES = ['SCHEDULED', 'HELD', 'CANCELLED'] as const;
export type PresentationStatus = (typeof PRESENTATION_STATUSES)[number];

export const PRESENTATION_STATUS_LABELS: Record<PresentationStatus, string> = {
  SCHEDULED: 'Scheduled',
  HELD: 'Held',
  CANCELLED: 'Cancelled',
};

/** Upper bound on one presentation's students — a sanity limit, not a rule. */
export const MAX_PRESENTATION_STUDENTS = 500;
