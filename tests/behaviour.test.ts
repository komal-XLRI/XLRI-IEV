import { describe, expect, it } from 'vitest';
import { averageBehaviourRating, BEHAVIOUR_AREAS } from '@/lib/constants/behaviour';
import { behaviourFeedbackSchema } from '@/validators/ventures';

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const allFours = Object.fromEntries(BEHAVIOUR_AREAS.map((area) => [area.key, '4']));

describe('HR & behaviour feedback input', () => {
  it('accepts a rating for every area, coercing form strings to numbers', () => {
    const result = behaviourFeedbackSchema.parse({
      studentVentureActivityId: id,
      ratings: allFours,
      comments: 'Works well with the team.',
    });
    expect(result.ratings.teamwork).toBe(4);
  });

  it('allows the comments to be left blank', () => {
    expect(
      behaviourFeedbackSchema.safeParse({ studentVentureActivityId: id, ratings: allFours })
        .success,
    ).toBe(true);
  });

  it('refuses a missing area', () => {
    const { conduct: _dropped, ...partial } = allFours;
    expect(
      behaviourFeedbackSchema.safeParse({ studentVentureActivityId: id, ratings: partial }).success,
    ).toBe(false);
  });

  it('refuses a rating outside 1–5', () => {
    for (const bad of ['0', '6', '2.5']) {
      expect(
        behaviourFeedbackSchema.safeParse({
          studentVentureActivityId: id,
          ratings: { ...allFours, teamwork: bad },
        }).success,
      ).toBe(false);
    }
  });
});

describe('average behaviour rating', () => {
  it('averages every area to one decimal place', () => {
    expect(
      averageBehaviourRating({
        teamwork: 5,
        communication: 4,
        discipline: 4,
        ownership: 3,
        conduct: 5,
      }),
    ).toBe(4.2);
  });
});
