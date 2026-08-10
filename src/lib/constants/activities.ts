import type { SupportScheduleType } from './status';

/** The 12 Venture Activities. Codes are stable identifiers — do not renumber. */
export const VENTURE_ACTIVITY_SEED = [
  {
    activityCode: 'V01',
    name: 'Idea Generation',
    order: 1,
    termNumber: 1,
    description:
      'Generate, capture and shortlist venture ideas from personal insight, observation and market gaps.',
  },
  {
    activityCode: 'V02',
    name: 'Problem Validation & Customer Discovery',
    order: 2,
    termNumber: 1,
    description:
      'Talk to real customers to validate that the problem exists, is painful and is worth solving.',
  },
  {
    activityCode: 'V03',
    name: 'Market & Competitor Research',
    order: 3,
    termNumber: 1,
    description:
      'Size the market, map competitors and substitutes, and identify a defensible position.',
  },
  {
    activityCode: 'V04',
    name: 'Solution Concept Definition',
    order: 4,
    termNumber: 1,
    description:
      'Define the solution concept, value proposition and the core features that address the validated problem.',
  },
  {
    activityCode: 'V05',
    name: 'Prototype Building',
    order: 5,
    termNumber: 2,
    description: 'Build a low-fidelity or working prototype that can be shown to real customers.',
  },
  {
    activityCode: 'V06',
    name: 'Customer Feedback & Iteration',
    order: 6,
    termNumber: 2,
    description:
      'Put the prototype in front of customers, capture structured feedback and iterate the concept.',
  },
  {
    activityCode: 'V07',
    name: 'Business Model Design',
    order: 7,
    termNumber: 2,
    description:
      'Design the business model: customer segments, channels, revenue streams and key partners.',
  },
  {
    activityCode: 'V08',
    name: 'Costing, Pricing & Unit Economics',
    order: 8,
    termNumber: 2,
    description:
      'Work out cost structure, pricing strategy and per-unit economics including contribution margin.',
  },
  {
    activityCode: 'V09',
    name: 'MVP / Pilot Launch',
    order: 9,
    termNumber: 3,
    description: 'Launch a minimum viable product or run a controlled pilot with real users.',
  },
  {
    activityCode: 'V10',
    name: 'First Sale / First Revenue',
    order: 10,
    termNumber: 3,
    description: 'Convert a real customer and record the first revenue for the venture.',
  },
  {
    activityCode: 'V11',
    name: 'Legal Setup, Compliance & Accounts',
    order: 11,
    termNumber: 3,
    description:
      'Register the entity, handle statutory compliance and set up books of account and banking.',
  },
  {
    activityCode: 'V12',
    name: 'Scale-up Plan, Funding Readiness & Final Pitch',
    order: 12,
    termNumber: 3,
    description:
      'Build the scale-up plan, prepare the funding narrative and deliver the final investor pitch.',
  },
] as const;

/** The 8 Support Activities. */
export const SUPPORT_ACTIVITY_SEED: ReadonlyArray<{
  activityCode: string;
  name: string;
  order: number;
  scheduleType: SupportScheduleType;
  description: string;
}> = [
  {
    activityCode: 'A1',
    name: 'Classroom Courses',
    order: 1,
    scheduleType: 'ACADEMIC_SESSION',
    description:
      'Programme subjects delivered as regular classroom sessions across the three terms.',
  },
  {
    activityCode: 'A2',
    name: 'Idea Generation & Pitch',
    order: 2,
    scheduleType: 'SPECIAL',
    description: 'Structured ideation and pitching sessions that feed the venture pipeline.',
  },
  {
    activityCode: 'A3',
    name: 'Tinkering Exercises',
    order: 3,
    scheduleType: 'INDEPENDENT',
    description: 'Hands-on making, breaking and prototyping exercises in the tinkering lab.',
  },
  {
    activityCode: 'A4',
    name: 'Weekend Internships',
    order: 4,
    scheduleType: 'WEEKEND',
    description: 'Short weekend placements with startups and small businesses.',
  },
  {
    activityCode: 'A5',
    name: 'Demo Sessions',
    order: 5,
    scheduleType: 'SPECIAL',
    description: 'Demonstration sessions where students present prototypes and progress.',
  },
  {
    activityCode: 'A6',
    name: 'Market Immersion',
    order: 6,
    scheduleType: 'FIELD',
    description: 'Time spent in the field with customers, traders and end users.',
  },
  {
    activityCode: 'A7',
    name: 'Expert Workshops',
    order: 7,
    scheduleType: 'ACADEMIC_SESSION',
    description:
      'Workshops led by domain experts, scheduled against the relevant academic subject session.',
  },
  {
    activityCode: 'A8',
    name: 'Exposure Visits',
    order: 8,
    scheduleType: 'FIELD',
    description: 'Visits to factories, incubators, accelerators and operating ventures.',
  },
];

/**
 * Default many-to-many mapping between Venture Activities and the Support
 * Activities that feed them. Fully editable from Admin after seeding.
 */
export const ACTIVITY_SUPPORT_MAPPING_SEED: Record<string, readonly string[]> = {
  V01: ['A1', 'A2', 'A8'],
  V02: ['A1', 'A6', 'A8'],
  V03: ['A1', 'A6', 'A7'],
  V04: ['A1', 'A2', 'A3'],
  V05: ['A3', 'A5', 'A7'],
  V06: ['A5', 'A6'],
  V07: ['A1', 'A7'],
  V08: ['A1', 'A7'],
  V09: ['A3', 'A4', 'A5'],
  V10: ['A4', 'A6'],
  V11: ['A1', 'A7'],
  V12: ['A2', 'A5', 'A7'],
};

/** Expert Workshops. Referenced by SubjectSessions rather than a Workshop collection. */
export const EXPERT_WORKSHOP_CODE = 'A7';

/** Programme guideline for Venture Activity duration — advisory, not enforced. */
export const VENTURE_ACTIVITY_GUIDELINE_MIN_DAYS = 12;
export const VENTURE_ACTIVITY_GUIDELINE_MAX_DAYS = 15;

export const DEFAULT_MAX_ATTEMPTS = 3;
