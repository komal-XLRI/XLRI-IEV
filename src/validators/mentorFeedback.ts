import { z } from 'zod';
import { objectId } from './common';
import { checkPrefillTemplate } from '@/lib/feedback/googleForm';
import {
  DEFAULT_REQUIRED_FEEDBACK_COUNT,
  MAX_REQUIRED_FEEDBACK_COUNT,
} from '@/lib/rules/mentorFeedback';

/** 32 random bytes, base64url: exactly 43 characters. */
export const FEEDBACK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const feedbackToken = z.string().regex(FEEDBACK_TOKEN_PATTERN, 'Invalid feedback token');

// ------------------------------------------------ Admin configuration ----

/**
 * One presentation's Google Form. A blank link clears the configuration;
 * otherwise the link must be a real pre-filled link carrying the {{IEV_TOKEN}}
 * placeholder.
 */
export const feedbackFormConfigSchema = z
  .object({
    presentationId: objectId,
    title: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || null),
    prefillUrlTemplate: z.string().trim().max(4000),
    enabled: z.boolean(),
    requiredFeedbackCount: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_REQUIRED_FEEDBACK_COUNT)
      .default(DEFAULT_REQUIRED_FEEDBACK_COUNT),
  })
  .superRefine((value, ctx) => {
    if (value.prefillUrlTemplate === '') return;
    const check = checkPrefillTemplate(value.prefillUrlTemplate);
    if (!check.ok) {
      ctx.addIssue({ code: 'custom', path: ['prefillUrlTemplate'], message: check.message });
    }
  });

export type FeedbackFormConfigInput = z.infer<typeof feedbackFormConfigSchema>;

// ------------------------------------------- Google Apps Script payload ----

const answer = z.union([
  z.string().max(20_000),
  z.array(z.string().max(5_000)).max(200),
  z.array(z.array(z.string().max(5_000)).max(50)).max(200),
]);

/**
 * What the Apps Script sends for one Form response. Parsed strictly: unknown
 * keys are dropped and every string is bounded, so a leaked secret still
 * cannot be used to push arbitrary documents into the database.
 */
export const googleFormFeedbackPayloadSchema = z.object({
  version: z.literal(1),
  token: z.string().trim().max(200),
  formId: z.string().trim().min(1).max(200),
  publishedUrl: z.string().trim().url().max(1000),
  responseId: z.string().trim().min(1).max(300),
  submittedAt: z.coerce.date(),
  respondentEmail: z
    .string()
    .trim()
    .max(320)
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null)),
  mentorName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => v || null),
  answers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(1000),
        type: z.string().trim().min(1).max(60),
        answer,
      }),
    )
    .max(300),
});

export type GoogleFormFeedbackPayload = z.infer<typeof googleFormFeedbackPayloadSchema>;

export const recordIdSchema = z.object({ recordId: objectId });
