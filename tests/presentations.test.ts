import { describe, expect, it } from 'vitest';
import {
  presentationStageState,
  statusOnPresentationCleared,
  statusOnPresentationReceived,
} from '@/lib/rules/presentations';
import { feedbackTally, isParticipantReceived } from '@/lib/rules/mentorFeedback';
import { createPresentationSchema } from '@/validators/presentations';

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('marking a presentation received', () => {
  it('moves a record that has not started to PRESENTATION_RECEIVED', () => {
    expect(statusOnPresentationReceived('NOT_STARTED')).toBe('PRESENTATION_RECEIVED');
    expect(statusOnPresentationReceived('IN_PROGRESS')).toBe('PRESENTATION_RECEIVED');
  });

  it('leaves a completed record completed', () => {
    expect(statusOnPresentationReceived('COMPLETED')).toBe('COMPLETED');
  });

  it('leaves a record mid-review under the old flow where it is', () => {
    expect(statusOnPresentationReceived('UNDER_REVIEW')).toBe('UNDER_REVIEW');
    expect(statusOnPresentationReceived('REVISION_REQUIRED')).toBe('REVISION_REQUIRED');
  });

  it('returns a withdrawn mark to NOT_STARTED, and nothing else', () => {
    expect(statusOnPresentationCleared('PRESENTATION_RECEIVED')).toBe('NOT_STARTED');
    expect(statusOnPresentationCleared('COMPLETED')).toBe('COMPLETED');
    expect(statusOnPresentationCleared('UNDER_REVIEW')).toBe('UNDER_REVIEW');
  });
});

describe('presentation stage state', () => {
  it('has nothing to collect with no students', () => {
    expect(presentationStageState({ total: 0, received: 0, completed: 0 })).toBe('NO_STUDENTS');
  });

  it('is collecting while any presentation is missing', () => {
    expect(presentationStageState({ total: 5, received: 4, completed: 0 })).toBe('COLLECTING');
  });

  it('waits on feedback once every presentation is in', () => {
    expect(presentationStageState({ total: 5, received: 5, completed: 0 })).toBe(
      'AWAITING_FEEDBACK',
    );
  });

  it('is only completed when every student has completed', () => {
    expect(presentationStageState({ total: 5, received: 5, completed: 4 })).toBe(
      'AWAITING_FEEDBACK',
    );
    expect(presentationStageState({ total: 5, received: 5, completed: 5 })).toBe('COMPLETED');
  });
});

describe('adding a presentation', () => {
  const base = {
    ventureActivityId: id,
    presentedOn: '2026-09-10',
    studentRecordIds: [id],
  };

  it('stores the date as that day, and defaults the rest', () => {
    const result = createPresentationSchema.parse(base);
    expect(result.presentedOn.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(result.startTime).toBeNull();
    expect(result.driveUrl).toBeNull();
    expect(result.status).toBe('SCHEDULED');
  });

  it('takes any number of students, and collapses duplicates', () => {
    const many = Array.from({ length: 7 }, (_, i) => `${'b'.repeat(23)}${i}`);
    expect(
      createPresentationSchema.parse({ ...base, studentRecordIds: many }).studentRecordIds,
    ).toHaveLength(7);
    expect(
      createPresentationSchema.parse({ ...base, studentRecordIds: [id, id] }).studentRecordIds,
    ).toEqual([id]);
  });

  it('needs at least one student and a date', () => {
    expect(createPresentationSchema.safeParse({ ...base, studentRecordIds: [] }).success).toBe(
      false,
    );
    expect(createPresentationSchema.safeParse({ ...base, presentedOn: '' }).success).toBe(false);
  });

  it('accepts a 24-hour time and an https Drive link', () => {
    const result = createPresentationSchema.parse({
      ...base,
      startTime: '14:30',
      driveUrl: ' https://drive.google.com/drive/folders/abc123 ',
    });
    expect(result.startTime).toBe('14:30');
    expect(result.driveUrl).toBe('https://drive.google.com/drive/folders/abc123');
    expect(createPresentationSchema.safeParse({ ...base, startTime: '25:00' }).success).toBe(false);
  });

  it('refuses a Drive link that is not https', () => {
    for (const url of [
      'http://drive.google.com/x',
      'javascript:alert(1)',
      'drive.google.com/x',
      'https://has space',
    ]) {
      expect(createPresentationSchema.safeParse({ ...base, driveUrl: url }).success).toBe(false);
    }
  });
});

describe('a student in a presentation', () => {
  const now = new Date();

  it('is received only when marked, on a sitting that is not cancelled', () => {
    expect(isParticipantReceived({ receivedAt: now }, { status: 'HELD' })).toBe(true);
    expect(isParticipantReceived({ receivedAt: now }, { status: 'SCHEDULED' })).toBe(true);
    expect(isParticipantReceived({ receivedAt: null }, { status: 'HELD' })).toBe(false);
    expect(isParticipantReceived({ receivedAt: now }, { status: 'CANCELLED' })).toBe(false);
  });

  it('counts only received students as owed feedback (2 of 3, not 2 of 4)', () => {
    const tally = feedbackTally(
      [
        { received: true, countedResponses: 1 },
        { received: true, countedResponses: 0 },
        { received: false, countedResponses: 0 },
        { received: true, countedResponses: 2 },
      ],
      1,
    );
    expect(tally).toMatchObject({ total: 4, received: 3, complete: 2, responses: 3 });
  });
});
