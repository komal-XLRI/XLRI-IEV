import { z } from 'zod';
import { dateSchema } from './common';

/**
 * A blank optional field arrives from a form as `''`, not as `undefined`.
 * Normalising here means the service and the model only ever see a real value
 * or nothing at all, so clearing a field actually clears it.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/**
 * A URL, not merely a string containing a dot.
 *
 * `new URL()` accepts `mailto:` and `javascript:` too, so the protocol is
 * checked explicitly — a stored `javascript:` URL would become a live XSS
 * vector the moment it is rendered as a link. The host is deliberately not
 * checked: Zoom and Drive are what these are for, but refusing anything else
 * would only stand between somebody and a link that works.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const optionalUrl = (message: string) =>
  optionalText(1000).refine((value) => value === undefined || isHttpUrl(value), { message });

export const recordingSchema = z.object({
  event: z.string().trim().min(1, 'Event is required').max(120),
  date: dateSchema,
  timings: optionalText(60),
  batch: optionalText(60),
  venue: optionalText(120),

  zoomLink: optionalUrl('Enter a valid Zoom link (https://…)'),
  meetingId: optionalText(40),
  passcode: optionalText(60),

  recordingLink: optionalUrl('Enter a valid recording link (https://…)'),
  recordingPasscode: optionalText(60),
});

export type RecordingInput = z.infer<typeof recordingSchema>;

/**
 * The shared folder link.
 *
 * Optional rather than required, because submitting the field empty is how the
 * banner is taken down again.
 */
export const recordingFolderSchema = z.object({
  link: optionalUrl('Enter a valid Drive link (https://…)'),
});

export type RecordingFolderInput = z.infer<typeof recordingFolderSchema>;
