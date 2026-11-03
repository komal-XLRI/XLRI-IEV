import { Download, QrCode } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import type { FeedbackQrResult } from '@/services/ventures/mentorFeedbackService';
import { formatDate } from '@/lib/utils/dates';

export interface StudentQr {
  participantId: string;
  presentedOn: string;
  result: FeedbackQrResult;
}

const PENDING_TEXT: Record<string, string> = {
  PRESENTATION_PENDING: 'Your QR appears here once your presentation is marked received.',
  NO_FORM: 'Your QR appears here once the programme office sets up the feedback form.',
};

/**
 * The student's own feedback QR, for mentors to scan after the presentation.
 * Shown for each presentation that is not cancelled; a presentation that is
 * not ready for feedback yet says what it is waiting for instead.
 */
export function FeedbackQrCard({ qrs }: { qrs: StudentQr[] }) {
  const shown = qrs.filter((qr) => qr.result.available || PENDING_TEXT[qr.result.reason]);
  if (shown.length === 0) return null;

  return (
    <Card className="mb-5">
      <CardHeader
        title="Your feedback QR"
        description="Show this to mentors after you present. Scanning it opens the feedback form for you. Feedback sent from a student account is not counted."
        icon={QrCode}
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {shown.map(({ participantId, presentedOn, result }) => (
          <section key={participantId} className="rounded-control space-y-3 border p-4">
            <p className="type-overline">Presentation on {formatDate(presentedOn)}</p>
            {result.available ? (
              <>
                <div
                  className="mx-auto w-full max-w-56 rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                  role="img"
                  aria-label="Feedback QR code"
                  // Generated on the server from our own feedback URL.
                  dangerouslySetInnerHTML={{ __html: result.svg }}
                />
                <a
                  href={result.pngDataUrl}
                  download={`my-feedback-qr-${presentedOn.slice(0, 10)}.png`}
                  className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Download QR
                </a>
              </>
            ) : (
              <p className="type-secondary">{PENDING_TEXT[result.reason]}</p>
            )}
          </section>
        ))}
      </CardBody>
    </Card>
  );
}
