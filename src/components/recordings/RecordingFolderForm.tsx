'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ActionForm } from '@/components/forms/ActionForm';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { setRecordingFolderAction } from '@/app/actions/adminRecordings';

/**
 * Set or replace the shared folder link.
 *
 * One field, and clearing it is how the banner comes down — a separate
 * "remove" control would be a second way to say the same thing.
 */
export function EditRecordingFolderForm({ link }: { link: string | null }) {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  const Icon = link ? Pencil : Plus;

  return (
    <>
      <Button size="sm" variant={link ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
        <Icon className="size-3.5" aria-hidden="true" />
        {link ? 'Change folder link' : 'Add folder link'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="All presentations folder"
        description="The one Drive folder that holds every presentation. It is shown above the register to you and to faculty."
      >
        <ActionForm
          action={setRecordingFolderAction}
          onSuccess={() => {
            setOpen(false);
            notify({ tone: 'success', title: 'Folder link saved' });
          }}
        >
          {({ fieldErrors }) => (
            <div className="space-y-4">
              <Field
                label="Drive folder link"
                htmlFor="link"
                error={fieldErrors?.link}
                hint="Leave it empty and save to take the banner down."
              >
                <TextInput
                  id="link"
                  name="link"
                  type="url"
                  autoFocus
                  inputMode="url"
                  maxLength={1000}
                  defaultValue={link ?? ''}
                  placeholder="https://drive.google.com/drive/folders/…"
                />
              </Field>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              </div>
            </div>
          )}
        </ActionForm>
      </Modal>
    </>
  );
}
