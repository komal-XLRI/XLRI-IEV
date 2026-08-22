import { Schema, type Model, type Types } from 'mongoose';
import {
  WORKSHOP_MODES,
  WORKSHOP_STATUSES,
  WORKSHOP_TYPES,
  requiresMeetingLink,
  requiresVenue,
  type WorkshopMode,
  type WorkshopStatus,
  type WorkshopType,
} from '@/lib/constants/workshops';
import { registerModel } from './registerModel';

/**
 * A standalone workshop event: a named host and speaker, a mode, and a place
 * or a link to attend it.
 *
 * Distinct from an Expert Workshop (support activity A7), which is delivered
 * inside the academic timetable as a SubjectSession and is assessed. This
 * record carries none of that — no attendance, no reviews, no progression —
 * and deliberately references no other collection, because a guest host or
 * speaker is not a user of this system and must not become one.
 *
 * `startTime` / `endTime` are 24-hour `HH:mm` strings against `date`, matching
 * how SubjectSession already stores a timetable slot.
 */
export interface IWorkshop {
  _id: Types.ObjectId;

  title: string;
  description?: string;

  /** What kind of session it is — independent of where it is attended. */
  workshopType: WorkshopType;

  date: Date;
  startTime: string;
  endTime: string;

  mode: WorkshopMode;
  venue?: string;
  meetingLink?: string;

  hostName: string;
  hostDesignation?: string;
  hostOrganisation?: string;
  hostLinkedIn?: string;

  speakerName: string;
  speakerDesignation?: string;
  speakerOrganisation?: string;
  speakerLinkedIn?: string;

  maxParticipants?: number | null;

  status: WorkshopStatus;

  /**
   * Whether the announcement has gone out to students.
   *
   * A flag on the workshop rather than a per-recipient log: the cohort is
   * small, the question an administrator actually asks is "have I told them
   * yet", and a delivery log nobody reads is a collection to maintain for
   * nothing. `emailSentAt` and `emailRecipientCount` describe the most recent
   * send, so a resend overwrites them rather than accumulating.
   */
  isEmailSent: boolean;
  emailSentAt?: Date | null;
  emailRecipientCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const workshopSchema = new Schema<IWorkshop>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 4000 },

    // Defaulted rather than required-without-default: workshops created before
    // this field existed have to stay readable and editable.
    workshopType: { type: String, required: true, enum: WORKSHOP_TYPES, default: 'OTHER' },

    date: { type: Date, required: true },
    startTime: { type: String, required: true, trim: true, match: TIME_PATTERN },
    endTime: { type: String, required: true, trim: true, match: TIME_PATTERN },

    mode: { type: String, required: true, enum: WORKSHOP_MODES },
    venue: { type: String, trim: true, maxlength: 300 },
    meetingLink: { type: String, trim: true, maxlength: 500 },

    hostName: { type: String, required: true, trim: true, maxlength: 160 },
    hostDesignation: { type: String, trim: true, maxlength: 160 },
    hostOrganisation: { type: String, trim: true, maxlength: 160 },
    hostLinkedIn: { type: String, trim: true, maxlength: 500 },

    speakerName: { type: String, required: true, trim: true, maxlength: 160 },
    speakerDesignation: { type: String, trim: true, maxlength: 160 },
    speakerOrganisation: { type: String, trim: true, maxlength: 160 },
    speakerLinkedIn: { type: String, trim: true, maxlength: 500 },

    maxParticipants: { type: Number, min: 1, max: 100_000, default: null },

    status: { type: String, required: true, enum: WORKSHOP_STATUSES, default: 'DRAFT' },

    isEmailSent: { type: Boolean, required: true, default: false },
    emailSentAt: { type: Date, default: null },
    emailRecipientCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, collection: 'workshops' },
);

workshopSchema.index({ date: -1 });
workshopSchema.index({ status: 1, date: -1 });
workshopSchema.index({ mode: 1 });
workshopSchema.index({ workshopType: 1, date: -1 });

/**
 * The mode rules are enforced here as well as in the Zod schema.
 *
 * Zod guards the form; this guards the collection. A workshop written by a
 * script, a seed or a future import path would otherwise be able to land as
 * "online" with nowhere to attend it.
 */
workshopSchema.pre('validate', function enforceModeAndTimeOrder() {
  if (this.endTime && this.startTime && this.endTime <= this.startTime) {
    throw new Error('Workshop endTime must be after startTime');
  }

  if (requiresVenue(this.mode) && !this.venue?.trim()) {
    throw new Error('Workshop venue is required for offline and hybrid workshops');
  }

  if (requiresMeetingLink(this.mode) && !this.meetingLink?.trim()) {
    throw new Error('Workshop meetingLink is required for online and hybrid workshops');
  }
});

export const Workshop: Model<IWorkshop> = registerModel<IWorkshop>('Workshop', workshopSchema);
