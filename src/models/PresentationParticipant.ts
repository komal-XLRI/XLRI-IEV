import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * One student in one presentation.
 *
 * Being scheduled is not the same as presenting: a student selected for a
 * sitting may not turn up. `receivedAt` records that this student's
 * presentation was actually received, and only then does this row have a
 * mentor-feedback QR. The same student may be a participant in any number of
 * presentations of the same stage, each with its own token and feedback.
 *
 * `studentVentureActivityId` is the student's progress record for the stage —
 * the thing feedback completes. The other ids are denormalised from it.
 */
export interface IPresentationParticipant {
  _id: Types.ObjectId;

  presentationId: Types.ObjectId;
  ventureActivityId: Types.ObjectId;
  studentVentureActivityId: Types.ObjectId;
  studentVentureId: Types.ObjectId;
  studentId: Types.ObjectId;

  /** When this student's presentation was marked received. Null = not received. */
  receivedAt?: Date | null;
  markedBy?: Types.ObjectId | null;

  /**
   * The secret in this participant's mentor-feedback QR. Issued lazily, the
   * first time an administrator opens the QR of a received participant.
   * Holding it grants nothing on its own: it only works while the participant
   * is received, which is checked live on every use.
   */
  feedbackToken?: string | null;
  feedbackTokenCreatedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const presentationParticipantSchema = new Schema<IPresentationParticipant>(
  {
    presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', required: true },
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },
    studentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVentureActivity',
      required: true,
    },
    studentVentureId: { type: Schema.Types.ObjectId, ref: 'StudentVenture', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    receivedAt: { type: Date, default: null },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    feedbackToken: { type: String, default: null },
    feedbackTokenCreatedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'presentationparticipants' },
);

// A student appears once per presentation — but in as many presentations as needed.
presentationParticipantSchema.index(
  { presentationId: 1, studentVentureActivityId: 1 },
  { unique: true },
);
presentationParticipantSchema.index({ studentVentureActivityId: 1, receivedAt: 1 });
presentationParticipantSchema.index({ ventureActivityId: 1 });
presentationParticipantSchema.index({ studentId: 1 });
// Partial rather than sparse: the field defaults to null, and a sparse unique
// index still indexes explicit nulls — every row without a token would clash.
presentationParticipantSchema.index(
  { feedbackToken: 1 },
  { unique: true, partialFilterExpression: { feedbackToken: { $type: 'string' } } },
);

export const PresentationParticipant: Model<IPresentationParticipant> =
  registerModel<IPresentationParticipant>('PresentationParticipant', presentationParticipantSchema);
