import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * Many-to-many join between Venture Activities and Support Activities.
 *
 *   V01 → A1, A2, A8      (a venture activity draws on several supports)
 *   A1  → V01, V02, V03…  (a support activity feeds several venture activities)
 *
 * Both directions are first-class queries, which is why this is a join
 * collection rather than an array field on VentureActivity.
 */
export interface IActivitySupportMapping {
  _id: Types.ObjectId;
  ventureActivityId: Types.ObjectId;
  supportActivityId: Types.ObjectId;
  createdAt: Date;
}

const activitySupportMappingSchema = new Schema<IActivitySupportMapping>(
  {
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },
    supportActivityId: { type: Schema.Types.ObjectId, ref: 'SupportActivity', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'activitysupportmappings' },
);

activitySupportMappingSchema.index(
  { ventureActivityId: 1, supportActivityId: 1 },
  { unique: true },
);
activitySupportMappingSchema.index({ supportActivityId: 1 });

export const ActivitySupportMapping: Model<IActivitySupportMapping> =
  registerModel<IActivitySupportMapping>('ActivitySupportMapping', activitySupportMappingSchema);
