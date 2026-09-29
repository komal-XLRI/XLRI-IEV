/**
 * HR & behaviour review.
 *
 * Runs alongside every venture activity rather than as a stage of its own: over
 * the course of each stage the programme office observes how each student
 * works with people, then records a rating per area and written feedback. It
 * is not tied to any support activity and does not gate stage completion.
 */
export const BEHAVIOUR_AREAS = [
  { key: 'teamwork', label: 'Teamwork & collaboration' },
  { key: 'communication', label: 'Communication' },
  { key: 'discipline', label: 'Discipline & punctuality' },
  { key: 'ownership', label: 'Ownership & initiative' },
  { key: 'conduct', label: 'Professional conduct' },
] as const;

export type BehaviourArea = (typeof BEHAVIOUR_AREAS)[number]['key'];
export type BehaviourRatings = Record<BehaviourArea, number>;

export const BEHAVIOUR_RATING_MIN = 1;
export const BEHAVIOUR_RATING_MAX = 5;

export const BEHAVIOUR_RATING_LABELS: Record<number, string> = {
  1: 'Needs significant improvement',
  2: 'Needs improvement',
  3: 'Meets expectations',
  4: 'Good',
  5: 'Excellent',
};

/** Programme guideline for how long the observation runs within a stage — advisory only. */
export const BEHAVIOUR_REVIEW_GUIDELINE_MIN_DAYS = 15;
export const BEHAVIOUR_REVIEW_GUIDELINE_MAX_DAYS = 20;

/** Mean of the area ratings, to one decimal place. */
export function averageBehaviourRating(ratings: BehaviourRatings): number {
  const values = BEHAVIOUR_AREAS.map((area) => ratings[area.key]);
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}
