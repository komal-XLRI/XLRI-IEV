import { Schema, type Model, type Types } from 'mongoose';
import {
  BEHAVIOUR_AREAS,
  BEHAVIOUR_RATING_MAX,
  BEHAVIOUR_RATING_MIN,
  type BehaviourRatings,
} from '@/lib/constants/behaviour';
import { registerModel } from './registerModel';

/**
 * The administrator's HR & behaviour feedback for one student on one venture
 * activity. One document per activity record; editing replaces it in place.
 *
 * `studentVentureId` and `ventureActivityId` are denormalised from the record
 * so a stage's feedback and a student's feedback can each be read without a
 * join.
 */
export interface IBehaviourFeedback {
  _id: Types.ObjectId;

  studentVentureActivityId: Types.ObjectId;
  studentVentureId: Types.ObjectId;
  ventureActivityId: Types.ObjectId;

  ratings: BehaviourRatings;
  comments?: string;

  givenBy: Types.ObjectId;
  givenAt: Date;
  updatedBy?: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

const rating = {
  type: Number,
  required: true,
  min: BEHAVIOUR_RATING_MIN,
  max: BEHAVIOUR_RATING_MAX,
};

const ratingsSchema = new Schema<BehaviourRatings>(
  Object.fromEntries(BEHAVIOUR_AREAS.map((area) => [area.key, rating])),
  { _id: false },
);

const behaviourFeedbackSchema = new Schema<IBehaviourFeedback>(
  {
    studentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVentureActivity',
      required: true,
    },
    studentVentureId: { type: Schema.Types.ObjectId, ref: 'StudentVenture', required: true },
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },

    ratings: { type: ratingsSchema, required: true },
    comments: { type: String, trim: true, maxlength: 4000 },

    givenBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    givenAt: { type: Date, required: true, default: () => new Date() },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'behaviourfeedback' },
);

behaviourFeedbackSchema.index({ studentVentureActivityId: 1 }, { unique: true });
behaviourFeedbackSchema.index({ ventureActivityId: 1 });
behaviourFeedbackSchema.index({ studentVentureId: 1 });

export const BehaviourFeedback: Model<IBehaviourFeedback> = registerModel<IBehaviourFeedback>(
  'BehaviourFeedback',
  behaviourFeedbackSchema,
);
