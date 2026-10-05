/**
 * Google Forms pre-filled links.
 *
 * The administrator does not look up `entry.123456` ids. In Google Forms they
 * use "Get pre-filled link", type the placeholders below as the answers, and
 * paste the link here. At redirect time each placeholder is swapped for the
 * real value, so the form's questions can change freely without the portal
 * knowing what they are.
 */
export const FEEDBACK_PLACEHOLDERS = {
  token: '{{IEV_TOKEN}}',
  student: '{{IEV_STUDENT}}',
  venture: '{{IEV_VENTURE}}',
  stage: '{{IEV_STAGE}}',
  date: '{{IEV_DATE}}',
} as const;

export type FeedbackPlaceholderValues = Record<keyof typeof FEEDBACK_PLACEHOLDERS, string>;

/**
 * The question the token is prefilled into, and that the Apps Script reads it
 * back from. Matching is on the start of the title, case-insensitive.
 */
export const TOKEN_QUESTION_TITLE = 'IEV Presentation ID (do not edit)';
export const TOKEN_QUESTION_PREFIX = 'iev presentation id';

export function isTokenQuestion(title: string): boolean {
  return title.trim().toLowerCase().startsWith(TOKEN_QUESTION_PREFIX);
}

const PUBLISHED_ID = /^\/forms\/d\/e\/([A-Za-z0-9_-]{20,})\/(viewform|formResponse)\/?$/;

/**
 * The public ("published") form id — the one in `/forms/d/e/{id}/viewform`.
 * It is different from the edit id `FormApp.getId()` returns, so the Apps
 * Script sends `getPublishedUrl()` and both sides compare this id.
 */
export function publishedFormIdFromUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;
  return PUBLISHED_ID.exec(url.pathname)?.[1] ?? null;
}

export type TemplateCheck =
  | { ok: true; publishedFormId: string; placeholders: Array<keyof typeof FEEDBACK_PLACEHOLDERS> }
  | { ok: false; message: string };

/** Validates a pasted pre-filled link and reports which placeholders it uses. */
export function checkPrefillTemplate(raw: string): TemplateCheck {
  const trimmed = raw.trim();
  const publishedFormId = publishedFormIdFromUrl(trimmed);
  if (!publishedFormId) {
    return {
      ok: false,
      message:
        'Paste the full pre-filled link from Google Forms (https://docs.google.com/forms/d/e/…/viewform?…). Short forms.gle links cannot be used.',
    };
  }

  const url = new URL(trimmed);
  const values = [...url.searchParams.values()];
  const placeholders = (
    Object.keys(FEEDBACK_PLACEHOLDERS) as Array<keyof typeof FEEDBACK_PLACEHOLDERS>
  ).filter((key) => values.some((value) => value.includes(FEEDBACK_PLACEHOLDERS[key])));

  if (!placeholders.includes('token')) {
    return {
      ok: false,
      message: `The link must prefill ${FEEDBACK_PLACEHOLDERS.token} into the “${TOKEN_QUESTION_TITLE}” question.`,
    };
  }

  return { ok: true, publishedFormId, placeholders };
}

/** Builds the mentor's pre-filled form URL by replacing every placeholder. */
export function fillPrefillTemplate(template: string, values: FeedbackPlaceholderValues): string {
  const url = new URL(template.trim());
  const replaced = new URLSearchParams();

  for (const [key, value] of url.searchParams) {
    let next = value;
    for (const name of Object.keys(FEEDBACK_PLACEHOLDERS) as Array<
      keyof typeof FEEDBACK_PLACEHOLDERS
    >) {
      next = next.split(FEEDBACK_PLACEHOLDERS[name]).join(values[name]);
    }
    replaced.append(key, next);
  }

  // Google needs `usp=pp_url` to honour prefilled answers; keep it if present.
  url.search = replaced.toString();
  return url.toString();
}
