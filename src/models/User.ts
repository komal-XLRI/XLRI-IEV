import { Schema, type Model, type Types } from 'mongoose';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '@/lib/constants/roles';
import { registerModel } from './registerModel';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: UserStatus;

  /** SHA-256 hash of the OTP. The plaintext OTP is never persisted. */
  otpHash?: string | null;
  otpExpiresAt?: Date | null;
  otpAttempts: number;
  otpLastSentAt?: Date | null;
  /** Rolling counter used to rate-limit OTP requests. */
  otpRequestCount: number;
  otpRequestWindowStart?: Date | null;

  lastLoginAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    phone: { type: String, trim: true },
    role: { type: String, required: true, enum: ROLES },
    status: { type: String, required: true, enum: USER_STATUSES, default: 'ACTIVE' },

    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastSentAt: { type: Date, default: null, select: false },
    otpRequestCount: { type: Number, default: 0, select: false },
    otpRequestWindowStart: { type: Date, default: null, select: false },

    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ name: 1 });

export const User: Model<IUser> = registerModel<IUser>('User', userSchema);
