import { describe, expect, it } from 'vitest';
import {
  feedbackTally,
  isFeedbackComplete,
  isPresentationReceived,
  supersededResponseIds,
} from '@/lib/rules/mentorFeedback';
import {
  checkPrefillTemplate,
  fillPrefillTemplate,
  isTokenQuestion,
  publishedFormIdFromUrl,
} from '@/lib/feedback/googleForm';
import { signFeedbackPayload, verifyFeedbackSignature } from '@/lib/feedback/signature';
import {
  FEEDBACK_TOKEN_PATTERN,
  feedbackFormConfigSchema,
  googleFormFeedbackPayloadSchema,
} from '@/validators/mentorFeedback';

const FORM_ID = '1FAIpQLSd_example_published_form_id_abc';
const TEMPLATE =
  `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=pp_url` +
  '&entry.111=%7B%7BIEV_TOKEN%7D%7D&entry.222=%7B%7BIEV_STUDENT%7D%7D' +
  '&entry.333=%7B%7BIEV_VENTURE%7D%7D&entry.444=%7B%7BIEV_STAGE%7D%7D' +
  '&entry.555=%7B%7BIEV_DATE%7D%7D';

// ------------------------------------------------ Availability (rule 3/4) ----

describe('presentation received — the only switch for QR and feedback', () => {
  it('is received when the received date is set', () => {
    expect(
      isPresentationReceived({
        presentationReceivedAt: new Date(),
        status: 'PRESENTATION_RECEIVED',
      }),
    ).toBe(true);
  });

  it('is received when the stage is already completed, even without a date', () => {
    expect(isPresentationReceived({ presentationReceivedAt: null, status: 'COMPLETED' })).toBe(
      true,
    );
  });

  it('is NOT received while pending, whatever the other status', () => {
    for (const status of [
      'NOT_STARTED',
      'IN_PROGRESS',
      'UNDER_REVIEW',
      'REVISION_REQUIRED',
    ] as const) {
      expect(isPresentationReceived({ presentationReceivedAt: null, status })).toBe(false);
    }
  });
});

describe('feedback completion', () => {
  it('needs the presentation received AND the required count', () => {
    expect(
      isFeedbackComplete({ received: true, countedResponses: 1, requiredFeedbackCount: 1 }),
    ).toBe(true);
    expect(
      isFeedbackComplete({ received: true, countedResponses: 1, requiredFeedbackCount: 2 }),
    ).toBe(false);
    expect(
      isFeedbackComplete({ received: true, countedResponses: 2, requiredFeedbackCount: 2 }),
    ).toBe(true);
  });

  it('is never complete for a pending presentation, however much feedback exists', () => {
    expect(
      isFeedbackComplete({ received: false, countedResponses: 5, requiredFeedbackCount: 1 }),
    ).toBe(false);
  });
});

describe('feedback tally (rule 14)', () => {
  it('counts feedback out of received presentations only — 5/8, not 5/12', () => {
    const records = [
      ...Array.from({ length: 5 }, () => ({ received: true, countedResponses: 1 })),
      ...Array.from({ length: 3 }, () => ({ received: true, countedResponses: 0 })),
      ...Array.from({ length: 4 }, () => ({ received: false, countedResponses: 0 })),
    ];
    const tally = feedbackTally(records, 1);
    expect(tally).toMatchObject({ total: 12, received: 8, complete: 5 });
  });

  it('ignores feedback left on a presentation that has since gone back to pending', () => {
    const tally = feedbackTally([{ received: false, countedResponses: 3 }], 1);
    expect(tally).toMatchObject({ received: 0, complete: 0, responses: 0 });
  });
});

// ------------------------------------------------- Duplicates (rule 12) ----

describe('duplicate handling', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 10, minutes));

  it('keeps separate mentors separate', () => {
    const superseded = supersededResponseIds([
      { id: 'a', submittedAt: at(0), mentorEmail: 'one@x.test', googleResponseId: 'r1' },
      { id: 'b', submittedAt: at(1), mentorEmail: 'two@x.test', googleResponseId: 'r2' },
    ]);
    expect([...superseded]).toEqual([]);
  });

  it('supersedes a mentor’s earlier response with their later one, case-insensitively', () => {
    const superseded = supersededResponseIds([
      { id: 'old', submittedAt: at(0), mentorEmail: 'One@X.test', googleResponseId: 'r1' },
      { id: 'new', submittedAt: at(5), mentorEmail: 'one@x.test', googleResponseId: 'r2' },
    ]);
    expect([...superseded]).toEqual(['old']);
  });

  it('decides by submission time, not by the order responses arrive in', () => {
    const superseded = supersededResponseIds([
      { id: 'new', submittedAt: at(5), mentorEmail: 'one@x.test', googleResponseId: 'r2' },
      { id: 'old', submittedAt: at(0), mentorEmail: 'one@x.test', googleResponseId: 'r1' },
    ]);
    expect([...superseded]).toEqual(['old']);
  });

  it('counts every response separately when no email was collected', () => {
    const superseded = supersededResponseIds([
      { id: 'a', submittedAt: at(0), mentorEmail: null, googleResponseId: 'r1' },
      { id: 'b', submittedAt: at(1), mentorEmail: null, googleResponseId: 'r2' },
    ]);
    expect(superseded.size).toBe(0);
  });
});

// ------------------------------------------------ Google Forms (rule 8) ----

describe('Google Form pre-filled links', () => {
  it('reads the published form id', () => {
    expect(publishedFormIdFromUrl(TEMPLATE)).toBe(FORM_ID);
    expect(publishedFormIdFromUrl(`https://docs.google.com/forms/d/e/${FORM_ID}/viewform`)).toBe(
      FORM_ID,
    );
  });

  it('refuses short links, other hosts and plain http', () => {
    expect(publishedFormIdFromUrl('https://forms.gle/abc123')).toBeNull();
    expect(publishedFormIdFromUrl(`https://evil.test/forms/d/e/${FORM_ID}/viewform`)).toBeNull();
    expect(
      publishedFormIdFromUrl(`http://docs.google.com/forms/d/e/${FORM_ID}/viewform`),
    ).toBeNull();
  });

  it('accepts a template with the token placeholder and reports the others', () => {
    const check = checkPrefillTemplate(TEMPLATE);
    expect(check.ok).toBe(true);
    if (check.ok)
      expect(check.placeholders.sort()).toEqual(['date', 'stage', 'student', 'token', 'venture']);
  });

  it('refuses a template without the token placeholder', () => {
    const check = checkPrefillTemplate(
      `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=pp_url&entry.1=x`,
    );
    expect(check.ok).toBe(false);
  });

  it('fills every placeholder and keeps usp=pp_url', () => {
    const filled = new URL(
      fillPrefillTemplate(TEMPLATE, {
        token: 'TOKEN123',
        student: 'Asha R & Co',
        venture: 'Kiln Café',
        stage: 'Understanding Customers & Market Sizing',
        date: '10 Sep 2026',
      }),
    );
    expect(filled.searchParams.get('entry.555')).toBe('10 Sep 2026');
    expect(filled.searchParams.get('usp')).toBe('pp_url');
    expect(filled.searchParams.get('entry.111')).toBe('TOKEN123');
    expect(filled.searchParams.get('entry.222')).toBe('Asha R & Co');
    expect(filled.searchParams.get('entry.333')).toBe('Kiln Café');
    expect(filled.searchParams.get('entry.444')).toBe('Understanding Customers & Market Sizing');
  });

  it('recognises the token question by its title', () => {
    expect(isTokenQuestion('IEV Presentation ID (do not edit)')).toBe(true);
    expect(isTokenQuestion('  iev presentation id')).toBe(true);
    expect(isTokenQuestion('Presentation feedback')).toBe(false);
  });

  it('validates the stage form configuration', () => {
    const base = {
      ventureActivityId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      enabled: true,
      requiredFeedbackCount: '2',
    };
    expect(
      feedbackFormConfigSchema.safeParse({ ...base, prefillUrlTemplate: TEMPLATE }).success,
    ).toBe(true);
    expect(feedbackFormConfigSchema.safeParse({ ...base, prefillUrlTemplate: '' }).success).toBe(
      true,
    );
    expect(
      feedbackFormConfigSchema.safeParse({ ...base, prefillUrlTemplate: 'https://forms.gle/x' })
        .success,
    ).toBe(false);
    expect(
      feedbackFormConfigSchema.safeParse({
        ...base,
        prefillUrlTemplate: TEMPLATE,
        requiredFeedbackCount: '0',
      }).success,
    ).toBe(false);
  });
});

// ------------------------------------------------ Webhook auth (rule 13) ----

describe('webhook signature', () => {
  const secret = 'x'.repeat(48);
  const body = '{"hello":"world"}';
  const now = new Date('2026-09-29T10:00:00Z');
  const ts = String(Math.floor(now.getTime() / 1000));

  it('accepts a correctly signed request', () => {
    const signature = signFeedbackPayload(secret, ts, body);
    expect(
      verifyFeedbackSignature({ secret, timestamp: ts, signature, rawBody: body, now }).ok,
    ).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and a missing signature', () => {
    const signature = signFeedbackPayload(secret, ts, body);
    expect(
      verifyFeedbackSignature({ secret, timestamp: ts, signature, rawBody: body + ' ', now }).ok,
    ).toBe(false);
    expect(
      verifyFeedbackSignature({
        secret: 'y'.repeat(48),
        timestamp: ts,
        signature,
        rawBody: body,
        now,
      }).ok,
    ).toBe(false);
    expect(
      verifyFeedbackSignature({ secret, timestamp: ts, signature: null, rawBody: body, now }).ok,
    ).toBe(false);
  });

  it('rejects a replay outside the five-minute window', () => {
    const old = String(Number(ts) - 301);
    const signature = signFeedbackPayload(secret, old, body);
    const result = verifyFeedbackSignature({
      secret,
      timestamp: old,
      signature,
      rawBody: body,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'STALE_TIMESTAMP' });
  });
});

describe('Apps Script payload', () => {
  const payload = {
    version: 1,
    token: 'a'.repeat(43),
    formId: 'edit-id',
    publishedUrl: `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`,
    responseId: 'resp-1',
    submittedAt: '2026-09-29T10:00:00.000Z',
    respondentEmail: 'Mentor@Example.test',
    mentorName: 'Dr Rao',
    answers: [
      { question: 'Persona creation', type: 'SCALE', answer: '4' },
      { question: 'Strengths', type: 'CHECKBOX', answer: ['Clarity', 'Evidence'] },
      { question: 'Grid', type: 'CHECKBOX_GRID', answer: [['Yes'], []] },
    ],
  };

  it('accepts text, checkbox and grid answers and lowercases the email', () => {
    const parsed = googleFormFeedbackPayloadSchema.parse(payload);
    expect(parsed.respondentEmail).toBe('mentor@example.test');
    expect(parsed.answers).toHaveLength(3);
  });

  it('refuses an unknown payload version', () => {
    expect(googleFormFeedbackPayloadSchema.safeParse({ ...payload, version: 2 }).success).toBe(
      false,
    );
  });

  it('token format is 43 base64url characters', () => {
    expect(FEEDBACK_TOKEN_PATTERN.test('a'.repeat(43))).toBe(true);
    expect(FEEDBACK_TOKEN_PATTERN.test('a'.repeat(42))).toBe(false);
    expect(FEEDBACK_TOKEN_PATTERN.test(`${'a'.repeat(42)}/`)).toBe(false);
  });
});
