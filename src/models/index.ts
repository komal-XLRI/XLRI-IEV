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
export { ActivitySupportMapping, type IActivitySupportMapping } from './ActivitySupportMapping';
export { StudentVentureActivity, type IStudentVentureActivity } from './StudentVentureActivity';

export { SupportActivity, type ISupportActivity } from './SupportActivity';
export { StudentSupportActivity, type IStudentSupportActivity } from './StudentSupportActivity';

export { VentureSubmission, type IVentureSubmission } from './VentureSubmission';
export { Review, type IReview } from './Review';
export { Evidence, type IEvidence } from './Evidence';
