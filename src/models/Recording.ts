import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * One row of the session register: when a session ran, where, and the Zoom and
 * recording links that go with it.
 *
 * These are the columns the programme office already keeps in a spreadsheet,
 * and nothing beyond them. Isolated on purpose — no `subjectId`, no
 * `sessionId`, no `workshopId`: a row is filed by whoever has the links, often
 * for something the timetable never held, so tying it to another collection
 * would mean either inventing a parent record or losing the links.
 *
 * Everything except the event and the date is optional, because a row is
 * usually created before its recording exists and sometimes never gets one.
 *
 * `timings` and `batch` are free text ("2:00 PM to 4:00 PM", "Both batches")
 * rather than parsed structures: they are read, not computed with, and a time
 * picker that refuses "10:00 AM – 12:00 PM" would be worse than the string.
 */
export interface IRecording {
  _id: Types.ObjectId;

  event: string;
  date: Date;
  timings?: string;
  batch?: string;
  venue?: string;

  zoomLink?: string;
  meetingId?: string;
  passcode?: string;

  recordingLink?: string;
  recordingPasscode?: string;

  createdAt: Date;
  updatedAt: Date;
}

const recordingSchema = new Schema<IRecording>(
  {
    event: { type: String, required: true, trim: true, maxlength: 120 },
    date: { type: Date, required: true },
    timings: { type: String, trim: true, maxlength: 60 },
    batch: { type: String, trim: true, maxlength: 60 },
    venue: { type: String, trim: true, maxlength: 120 },

    zoomLink: { type: String, trim: true, maxlength: 1000 },
    meetingId: { type: String, trim: true, maxlength: 40 },
    passcode: { type: String, trim: true, maxlength: 60 },

    recordingLink: { type: String, trim: true, maxlength: 1000 },
    recordingPasscode: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true, collection: 'recordings' },
);

recordingSchema.index({ date: 1 });

export const Recording: Model<IRecording> = registerModel<IRecording>('Recording', recordingSchema);
