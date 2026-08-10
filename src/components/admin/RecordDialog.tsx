'use client';

import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ActionForm, type FormAction } from '@/components/forms/ActionForm';
import { useToast } from '@/components/ui/Toast';

/**
 * "Create record" as a dialog rather than a panel that expands in place.
 *
 * The inline version pushed the table it sat above halfway down the screen and
 * left the page in two different shapes depending on whether the form was open.
 * A dialog keeps the record list as the page's subject and gives the form the
 * focus trap and Escape handling a data-entry surface should have.
 *
 * The Server Action itself is untouched — this only changes where the form is
 * drawn and how success is reported.
 */
export function RecordDialog<T>({
  title,
  description,
  triggerLabel,
  submitLabel,
  successMessage,
  action,
  children,
  size = 'lg',
}: {
  title: string;
  description?: string;
  triggerLabel: string;
  submitLabel: string;
  successMessage: string;
  action: FormAction<T>;
  children: (state: { fieldErrors?: Record<string, string> }) => ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        {triggerLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
      >
        <ActionForm
          action={action}
          onSuccess={() => {
            setOpen(false);
            notify({ tone: 'success', title: successMessage });
          }}
        >
          {({ fieldErrors }) => (
            <div className="space-y-4">
              {children({ fieldErrors })}

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
              </div>
            </div>
          )}
        </ActionForm>
      </Modal>
    </>
  );
}
