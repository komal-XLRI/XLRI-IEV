/**
 * Standalone workshop vocabulary.
 *
 * Kept out of `status.ts` because these describe an event the programme office
 * runs, not a student's progress through the programme — nothing here feeds
 * progression, attempts or the dual-review rule.
 *
 * Client components import these for filters and labels, so this module must
 * stay free of anything `server-only`.
 */

export const WORKSHOP_MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;
export type WorkshopMode = (typeof WORKSHOP_MODES)[number];

/**
 * What kind of session this is.
 *
 * Separate from `mode`, which is only about where to attend. Two workshops can
 * both be offline and still be entirely different things to plan, staff and
 * report on — an industrial visit needs transport and a host site, a founder
 * talk needs a room and a speaker.
 *
 * `OTHER` is deliberate rather than lazy: without it the list would have to be
 * exhaustive on day one, and the alternative is an administrator filing a
 * session under the nearest wrong label.
 */
export const WORKSHOP_TYPES = [
  'INDUSTRIAL_VISIT',
  'ENTREPRENEUR_SESSION',
  'FOUNDER_TALK',
  'PARTNER_SESSION',
  'MASTERCLASS',
  'PANEL_DISCUSSION',
  'NETWORKING',
  'OTHER',
] as const;
export type WorkshopType = (typeof WORKSHOP_TYPES)[number];

export const WORKSHOP_TYPE_LABELS: Record<WorkshopType, string> = {
  INDUSTRIAL_VISIT: 'Industrial visit',
  ENTREPRENEUR_SESSION: 'Entrepreneur session',
  FOUNDER_TALK: 'Founder talk',
  PARTNER_SESSION: 'Partner session',
  MASTERCLASS: 'Masterclass',
  PANEL_DISCUSSION: 'Panel discussion',
  NETWORKING: 'Networking',
  OTHER: 'Other',
};

export const WORKSHOP_STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

export const WORKSHOP_MODE_LABELS: Record<WorkshopMode, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  HYBRID: 'Hybrid',
};

export const WORKSHOP_STATUS_LABELS: Record<WorkshopStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** A venue is meaningless for a purely online workshop, and vice versa. */
export function requiresVenue(mode: WorkshopMode): boolean {
  return mode === 'OFFLINE' || mode === 'HYBRID';
}

export function requiresMeetingLink(mode: WorkshopMode): boolean {
  return mode === 'ONLINE' || mode === 'HYBRID';
}
