'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ActionForm } from '@/components/forms/ActionForm';
import { useToast } from '@/components/ui/Toast';
import { RecordDialog } from './RecordDialog';
import { WorkshopFields, type WorkshopValues } from './WorkshopFields';
import { createWorkshopAction, updateWorkshopAction } from '@/app/actions/adminWorkshops';

/** "Add workshop" — the primary action on the workshops page. */
export function CreateWorkshopForm() {
  return (
    <RecordDialog
      action={createWorkshopAction}
      triggerLabel="Add workshop"
      title="Add a workshop"
      description="A standalone event with its own host and speaker. Save it as a draft and publish when the details are confirmed."
      submitLabel="Create workshop"
      successMessage="Workshop created"
    >
      {({ fieldErrors }) => <WorkshopFields fieldErrors={fieldErrors} />}
    </RecordDialog>
  );
}

/**
 * Edit, as a dialog opened from the row or the detail page.
 *
 * Not a RecordDialog: that component owns its own trigger button and always
 * draws a "New …" primary button, which is the wrong affordance in a table row.
 */
export function EditWorkshopForm({
  workshop,
  variant = 'icon',
}: {
  workshop: WorkshopValues & { _id: string };
  variant?: 'icon' | 'button';
}) {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${workshop.title}`}
          className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control inline-flex size-8 items-center justify-center transition-colors"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Edit workshop"
        description={workshop.title}
      >
        <ActionForm
          action={updateWorkshopAction}
          onSuccess={() => {
            setOpen(false);
            notify({ tone: 'success', title: 'Workshop updated' });
          }}
        >
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <input type="hidden" name="workshopId" value={workshop._id} />

              <WorkshopFields values={workshop} fieldErrors={fieldErrors} />

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
              </div>
            </div>
          )}
        </ActionForm>
      </Modal>
    </>
  );
}
