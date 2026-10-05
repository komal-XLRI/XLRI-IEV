'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { deleteStudentAction } from '@/app/actions/adminUsers';

/**
 * Permanently deletes a student.
 *
 * Unlike deactivation this cannot be undone, so the confirm button stays off
 * until the student's email has been typed — the server checks it again.
 */
export function DeleteStudentButton({
  student,
  redirectTo,
  size = 'sm',
}: {
  student: { _id: string; name: string; email: string };
  /** Where to go once the student is gone — needed when on the student's own page. */
  redirectTo?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const router = useRouter();
  const inputId = useId();

  const matches = typed.trim().toLowerCase() === student.email.toLowerCase();

  function close() {
    setOpen(false);
    setTyped('');
  }

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('userId', student._id);
      formData.set('confirmEmail', typed);

      const result = await deleteStudentAction(null, formData);

      if (!result.ok) {
        notify({
          tone: 'error',
          title: 'Could not delete the student',
          description: result.message,
        });
        return;
      }

      close();
      notify({
        tone: 'success',
        title: 'Student deleted',
        description:
          result.data.filesLeftInStorage > 0
            ? `${student.name} was removed. ${result.data.filesLeftInStorage} uploaded file(s) could not be removed from storage.`
            : `${student.name} and all of their records were removed.`,
      });
      if (redirectTo) router.push(redirectTo);
    });
  }

  return (
    <>
      <Button variant="danger" size={size} disabled={pending} onClick={() => setOpen(true)}>
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        busy={pending}
        confirmDisabled={!matches}
        onClose={close}
        onConfirm={remove}
        title={`Delete ${student.name}?`}
        confirmLabel="Delete permanently"
        message={
          <>
            <p>
              This permanently removes the student account and everything in their name: their
              venture, activity and presentation records, any submissions, reviews and uploaded
              files, all attendance, workshop feedback, HR & behaviour feedback and mentor feedback.
            </p>
            <p className="mt-2 font-medium">This cannot be undone.</p>
            <p className="text-muted-foreground mt-2">
              To keep their history, use Deactivate instead.
            </p>
            <label htmlFor={inputId} className="mt-3 block text-sm">
              Type <span className="font-mono font-semibold">{student.email}</span> to confirm
            </label>
            <TextInput
              id={inputId}
              className="mt-1.5"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          </>
        }
      />
    </>
  );
}
