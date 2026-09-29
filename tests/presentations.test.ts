import { describe, expect, it } from 'vitest';
import {
  presentationStageState,
  statusOnPresentationCleared,
  statusOnPresentationReceived,
} from '@/lib/rules/presentations';
import { presentationFolderSchema } from '@/validators/ventures';

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

describe('presentation folder link', () => {
  it('accepts an https Drive link', () => {
    const result = presentationFolderSchema.parse({
      ventureActivityId: id,
      presentationFolderUrl: ' https://drive.google.com/drive/folders/abc123 ',
    });
    expect(result.presentationFolderUrl).toBe('https://drive.google.com/drive/folders/abc123');
  });

  it('treats a blank link as clearing it', () => {
    const result = presentationFolderSchema.parse({
      ventureActivityId: id,
      presentationFolderUrl: '',
    });
    expect(result.presentationFolderUrl).toBeNull();
  });

  it('refuses anything that is not an https link', () => {
    for (const url of [
      'http://drive.google.com/x',
      'javascript:alert(1)',
      'drive.google.com/x',
      'https://has space',
    ]) {
      expect(
        presentationFolderSchema.safeParse({ ventureActivityId: id, presentationFolderUrl: url })
          .success,
      ).toBe(false);
    }
  });
});
