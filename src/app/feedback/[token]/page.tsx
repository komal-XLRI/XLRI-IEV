import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StatusScreen } from '@/components/branding/StatusScreen';
import { resolveFeedbackLink } from '@/services/ventures/mentorFeedbackService';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mentor feedback',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const MESSAGES = {
  INVALID: {
    title: 'Invalid or expired feedback link.',
    description: 'Ask the programme office for the current QR code for this presentation.',
  },
  PENDING: {
    title: 'Feedback is currently unavailable.',
    description: 'This presentation has not been received yet. Feedback is currently unavailable.',
  },
  NO_FORM: {
    title: 'Feedback form is not configured for this presentation.',
    description: 'Please let the programme office know so they can set it up.',
  },
  UNAVAILABLE: {
    title: 'Feedback is currently unavailable.',
    description: 'Feedback for this presentation has been paused by the programme office.',
  },
} as const;

/**
 * Where a mentor's QR scan lands. Public — mentors have no portal account —
 * so the token is the only input, and every rule is re-checked against the
 * database before the mentor is sent to the stage's Google Form.
 */
export default async function FeedbackRedirectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolution = await resolveFeedbackLink(token);

  if (resolution.ok) redirect(resolution.formUrl);

  const message = MESSAGES[resolution.reason];
  return (
    <StatusScreen code="Mentor feedback" title={message.title} description={message.description} />
  );
}
