/**
 * HR & behaviour review.
 *
 * Runs alongside every venture activity rather than as a stage of its own: over
 * the course of each stage the programme office observes how each student
 * works with people, then records a rating per area and written feedback. It
 * is not tied to any support activity and does not gate stage completion.
 */
export const BEHAVIOUR_AREAS = [
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'communication', label: 'Communication' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'clarityOfThought', label: 'Clarity of thought' },
  { key: 'actingOnFeedback', label: 'Ability to work on feedback' },
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

function isRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= BEHAVIOUR_RATING_MIN &&
    value <= BEHAVIOUR_RATING_MAX
  );
}

/**
 * Mean of the areas that carry a rating, to one decimal place; null when none
 * do. Feedback saved before an area was added has no rating for it, and
 * averaging over the gap is what produced "NaN".
 */
export function averageBehaviourRating(ratings: Partial<Record<string, unknown>>): number | null {
  const values = BEHAVIOUR_AREAS.map((area) => ratings[area.key]).filter(isRating);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/** The areas this feedback has no rating for — it needs re-rating on those. */
export function missingBehaviourAreas(ratings: Partial<Record<string, unknown>>): string[] {
  return BEHAVIOUR_AREAS.filter((area) => !isRating(ratings[area.key])).map((area) => area.label);
}
