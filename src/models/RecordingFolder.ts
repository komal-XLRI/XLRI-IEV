import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/**
 * The one Drive folder holding all the presentations.
 *
 * A single document rather than a row per folder: there is one folder, it is
 * shown at the top of the register, and a collection that can hold two of them
 * would immediately raise the question of which one that banner means.
 *
 * `key` exists only to pin that singleton. Every write upserts against it, so
 * a second document cannot be created even by a script.
 */
export interface IRecordingFolder {
  _id: Types.ObjectId;
  key: string;
  link: string;
  createdAt: Date;
  updatedAt: Date;
}

export const RECORDING_FOLDER_KEY = 'presentations';

const recordingFolderSchema = new Schema<IRecordingFolder>(
  {
    key: { type: String, required: true, unique: true, default: RECORDING_FOLDER_KEY },
    link: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: 'recordingfolders' },
);

export const RecordingFolder: Model<IRecordingFolder> = registerModel<IRecordingFolder>(
  'RecordingFolder',
  recordingFolderSchema,
);
