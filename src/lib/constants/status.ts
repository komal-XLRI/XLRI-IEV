/** Lifecycle of a student's work on one Venture Activity. */
export const STUDENT_ACTIVITY_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'COMPLETED',
  'MAX_ATTEMPTS_REACHED',
] as const;
export type StudentActivityStatus = (typeof STUDENT_ACTIVITY_STATUSES)[number];

/**
 * UI-only state. `LOCKED` is never persisted — it is derived from the
 * sequential progression rule at read time.
 */
export const UI_ACTIVITY_STATES = ['LOCKED', ...STUDENT_ACTIVITY_STATUSES] as const;
export type UiActivityState = (typeof UI_ACTIVITY_STATES)[number];

/** Per-reviewer verdict recorded on StudentVentureActivity. */
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REVISION_REQUIRED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Verdicts a reviewer may actually submit (PENDING is the initial state only). */
export const REVIEW_DECISIONS = ['APPROVED', 'REVISION_REQUIRED', 'REJECTED'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const REVIEWER_TYPES = ['FACULTY', 'MENTOR'] as const;
export type ReviewerType = (typeof REVIEWER_TYPES)[number];

export const SUBMISSION_TYPES = ['INITIAL', 'REVISION', 'FINAL'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const SUPPORT_ACTIVITY_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'UNDER_REVIEW',
  'COMPLETED',
  'REVISION_REQUIRED',
  'REJECTED',
] as const;
export type SupportActivityStatus = (typeof SUPPORT_ACTIVITY_STATUSES)[number];

export const TERM_STATUSES = ['UPCOMING', 'ACTIVE', 'COMPLETED'] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];

export const CONTENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const VENTURE_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'DISCONTINUED'] as const;
export type VentureStatus = (typeof VENTURE_STATUSES)[number];

export const SUPPORT_SCHEDULE_TYPES = [
  'ACADEMIC_SESSION',
  'INDEPENDENT',
  'FIELD',
  'WEEKEND',
  'SPECIAL',
] as const;
export type SupportScheduleType = (typeof SUPPORT_SCHEDULE_TYPES)[number];

export const SESSION_TYPES = ['LECTURE', 'WORKSHOP', 'LAB', 'SEMINAR', 'FIELD_VISIT'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * Attendance on a Venture Activity.
 *
 * Two values, and no "pending". A `VentureActivityAttendance` row exists only
 * once somebody has marked it, exactly like `SubjectAttendance` — so "nobody
 * has said yet" is the absence of a record, not a third status. Keeping it as
 * a status was the mistake in the previous design: it made an unmarked
 * register indistinguishable from a marked-absent student in every count.
 *
 * `LATE` and `EXCUSED` exist for class attendance and deliberately do not
 * exist here; a venture activity runs over days, so neither means anything.
 *
 * Shared by the Venture Activity register and the workshop register. The two
 * differ in what they are keyed on and whether a date is involved, but "what
 * marks may a register take" is one answer, and two copies of it would drift.
 */
export const ATTENDANCE_MARKS = ['PRESENT', 'ABSENT'] as const;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

export const ATTENDANCE_MARK_LABELS: Record<AttendanceMark, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
};

export const STATUS_LABELS: Record<UiActivityState, string> = {
  LOCKED: 'Locked',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  UNDER_REVIEW: 'Under review',
  REVISION_REQUIRED: 'Revision required',
  COMPLETED: 'Completed',
  MAX_ATTEMPTS_REACHED: 'Max attempts reached',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REVISION_REQUIRED: 'Revision required',
  REJECTED: 'Rejected',
};
