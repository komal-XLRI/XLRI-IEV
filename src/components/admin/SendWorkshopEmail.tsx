'use client';

import { useState, useTransition } from 'react';
import { Mail, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { sendWorkshopEmailAction } from '@/app/actions/adminWorkshops';
import { formatDateTime } from '@/lib/utils/dates';

export interface WorkshopEmailState {
  isEmailSent: boolean;
  /** ISO string — Dates do not cross the server/client boundary. */
  emailSentAt: string | null;
  emailRecipientCount: number;
}

/**
 * Sends the workshop announcement to every active student.
 *
 * Always behind a confirmation, and the confirmation names the number of people
 * who will receive it: this is the one action on the page that reaches outside
 * the application, and it cannot be undone by clicking again.
 */
export function SendWorkshopEmail({
  workshopId,
  title,
  recipientCount,
  email,
  variant = 'icon',
}: {
  workshopId: string;
  title: string;
  /** Active students, counted on the server so the dialog can be specific. */
  recipientCount: number;
  email: WorkshopEmailState;
  variant?: 'icon' | 'button';
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const label = email.isEmailSent
    ? `Email students about ${title} again`
    : `Email students about ${title}`;
  const Icon = email.isEmailSent ? MailCheck : Mail;

  function send() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('workshopId', workshopId);

      const result = await sendWorkshopEmailAction(null, formData);
      setConfirming(false);

      if (!result.ok) {
        notify({
          tone: 'error',
          title: 'Could not email the students',
          description: result.message,
        });
        return;
      }

      const { sent, failed, failedRecipients } = result.data;

      // A partial send is reported as a partial send. Calling it a success
      // would leave someone believing the whole cohort was told.
      notify(
        failed === 0
          ? {
              tone: 'success',
              title: `Emailed ${sent} student${sent === 1 ? '' : 's'}`,
              description: title,
            }
          : {
              tone: 'error',
              title: `Emailed ${sent} of ${sent + failed} students`,
              description: `Delivery failed for ${failedRecipients.slice(0, 3).join(', ')}${
                failedRecipients.length > 3 ? ` and ${failedRecipients.length - 3} more` : ''
              }.`,
            },
      );
    });
  }

  return (
    <>
      {variant === 'button' ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirming(true)}
          disabled={pending || recipientCount === 0}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {email.isEmailSent ? 'Email again' : 'Send email'}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending || recipientCount === 0}
          aria-label={label}
          title={label}
          className={
            email.isEmailSent
              ? 'text-success-soft-foreground hover:bg-success-soft rounded-control disabled:text-subtle-foreground inline-flex size-8 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent'
              : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control disabled:text-subtle-foreground inline-flex size-8 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent'
          }
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      )}

      <ConfirmDialog
        open={confirming}
        busy={pending}
        tone="primary"
        onClose={() => setConfirming(false)}
        onConfirm={send}
        title={email.isEmailSent ? `Email students again?` : `Email students about this workshop?`}
        confirmLabel={email.isEmailSent ? 'Send again' : 'Send email'}
        message={
          <>
            <p>
              The date, time, venue and joining details for{' '}
              <span className="text-foreground font-medium">{title}</span> will be sent to{' '}
              <span className="text-foreground font-medium">
                {recipientCount} active student{recipientCount === 1 ? '' : 's'}
              </span>
              .
            </p>

            {email.isEmailSent ? (
              <p className="text-warning-soft-foreground bg-warning-soft border-warning-border mt-2 rounded-md border px-2.5 py-2">
                This workshop was already emailed on {formatDateTime(email.emailSentAt)} to{' '}
                {email.emailRecipientCount} student
                {email.emailRecipientCount === 1 ? '' : 's'}. They will receive it a second time.
              </p>
            ) : null}

            <p className="text-muted-foreground mt-2">
              Emails cannot be recalled. Check the details are final before sending.
            </p>
          </>
        }
      />
    </>
  );
}
