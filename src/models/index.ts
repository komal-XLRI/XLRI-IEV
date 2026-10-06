/**
 * Single import point for all models. Importing this module guarantees every
 * schema is registered before any `populate()` runs — Mongoose throws
 * `MissingSchemaError` otherwise.
 */
export { User, type IUser } from './User';
export { StudentProfile, type IStudentProfile } from './StudentProfile';
export { FacultyProfile, type IFacultyProfile } from './FacultyProfile';
export { MentorProfile, type IMentorProfile } from './MentorProfile';

export { Term, type ITerm } from './Term';
export { Subject, type ISubject } from './Subject';
export {
  SubjectFacultyAssignment,
  type ISubjectFacultyAssignment,
} from './SubjectFacultyAssignment';
export { SubjectSession, type ISubjectSession } from './SubjectSession';
export { SubjectAttendance, type ISubjectAttendance } from './SubjectAttendance';

export { StudentVenture, type IStudentVenture } from './StudentVenture';
export { VentureActivity, type IVentureActivity } from './VentureActivity';
export type { IFeedbackFormConfig } from './feedbackFormConfig';
export { ActivitySupportMapping, type IActivitySupportMapping } from './ActivitySupportMapping';
export { StudentVentureActivity, type IStudentVentureActivity } from './StudentVentureActivity';
export {
  VentureActivityAttendance,
  attendanceDay,
  type IVentureActivityAttendance,
} from './VentureActivityAttendance';

export { Presentation, type IPresentation } from './Presentation';
export { PresentationParticipant, type IPresentationParticipant } from './PresentationParticipant';

export { BehaviourFeedback, type IBehaviourFeedback } from './BehaviourFeedback';
export { MentorFeedback, type IMentorFeedback, type IMentorFeedbackAnswer } from './MentorFeedback';
export {
  FeedbackSyncLog,
  FEEDBACK_SYNC_OUTCOMES,
  type FeedbackSyncOutcome,
  type IFeedbackSyncLog,
} from './FeedbackSyncLog';

export { SupportActivity, type ISupportActivity } from './SupportActivity';
export { StudentSupportActivity, type IStudentSupportActivity } from './StudentSupportActivity';

export { Recording, type IRecording } from './Recording';
export { RecordingFolder, RECORDING_FOLDER_KEY, type IRecordingFolder } from './RecordingFolder';

export { Workshop, type IWorkshop } from './Workshop';
export { WorkshopAttendance, type IWorkshopAttendance } from './WorkshopAttendance';
export { WorkshopFeedback, type IWorkshopFeedback } from './WorkshopFeedback';

export {
  Notification,
  NOTIFICATION_TTL_DAYS,
  type INotification,
  type NotificationAudience,
  type NotificationTone,
} from './Notification';

export { VentureSubmission, type IVentureSubmission } from './VentureSubmission';
export { Review, type IReview } from './Review';
export { Evidence, type IEvidence } from './Evidence';
