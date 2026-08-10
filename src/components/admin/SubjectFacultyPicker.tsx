'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/forms/ActionForm';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Field';
import { setSubjectFacultyAction } from '@/app/actions/adminAcademic';
import type { PersonOption } from './CreateVentureForm';

/**
 * Teaching roster for one subject. Assigning faculty here has no effect on
 * venture review rights — that is set per venture under Ventures.
 */
export function SubjectFacultyPicker({
  subjectId,
  faculty,
  selectedIds,
}: {
  subjectId: string;
  faculty: PersonOption[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const selectedNames = faculty.filter((f) => selectedIds.includes(f._id)).map((f) => f.name);

  return (
    <div className="min-w-56">
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground text-xs">
          {selectedNames.length > 0 ? selectedNames.join(', ') : 'None assigned'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Edit'}
        </Button>
      </div>

      {open ? (
        <ActionForm action={setSubjectFacultyAction} successMessage="Saved." className="mt-2">
          {() => (
            <div className="surface-sunken space-y-2 rounded-lg p-2">
              <input type="hidden" name="subjectId" value={subjectId} />
              {faculty.length === 0 ? (
                <p className="text-muted-foreground text-xs">No faculty accounts exist yet.</p>
              ) : (
                faculty.map((person) => (
                  <Checkbox
                    key={person._id}
                    name="facultyIds"
                    value={person._id}
                    defaultChecked={selectedIds.includes(person._id)}
                    label={person.name}
                    className="text-xs"
                  />
                ))
              )}
              <SubmitButton size="sm" pendingLabel="Saving…">
                Save
              </SubmitButton>
            </div>
          )}
        </ActionForm>
      ) : null}
    </div>
  );
}
