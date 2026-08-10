import { Schema, type Model, type Types } from 'mongoose';
import { TERM_STATUSES, type TermStatus } from '@/lib/constants/status';
import { isEndOnOrAfterStart } from '@/lib/utils/dates';
import { registerModel } from './registerModel';

export interface ITerm {
  _id: Types.ObjectId;
  termNumber: number;
  name: string;
  startDate: Date;
  endDate: Date;
  status: TermStatus;
  createdAt: Date;
  updatedAt: Date;
}

const termSchema = new Schema<ITerm>(
  {
    termNumber: { type: Number, required: true, min: 1, max: 3 },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, required: true, enum: TERM_STATUSES, default: 'UPCOMING' },
  },
  { timestamps: true, collection: 'terms' },
);

termSchema.index({ termNumber: 1 }, { unique: true });
termSchema.index({ status: 1 });

termSchema.pre('validate', async function validateDateOrder() {
  if (this.startDate && this.endDate && !isEndOnOrAfterStart(this.startDate, this.endDate)) {
    throw new Error('Term endDate must be on or after startDate');
  }
});

export const Term: Model<ITerm> = registerModel<ITerm>('Term', termSchema);
