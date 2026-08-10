import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * Which faculty teach which subject. A subject may have several.
 *
 * Teaching a subject does NOT make someone a Venture Activity reviewer — that
 * is controlled exclusively by StudentVenture.facultyId.
 */
export interface ISubjectFacultyAssignment {
  _id: Types.ObjectId;
  subjectId: Types.ObjectId;
  facultyId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const subjectFacultyAssignmentSchema = new Schema<ISubjectFacultyAssignment>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    facultyId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'subjectfacultyassignments' },
);

subjectFacultyAssignmentSchema.index({ subjectId: 1, facultyId: 1 }, { unique: true });
subjectFacultyAssignmentSchema.index({ facultyId: 1 });

export const SubjectFacultyAssignment: Model<ISubjectFacultyAssignment> =
  registerModel<ISubjectFacultyAssignment>(
    'SubjectFacultyAssignment',
    subjectFacultyAssignmentSchema,
  );
