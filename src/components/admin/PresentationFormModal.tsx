'use client';

import { useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { ActionForm, type FormAction } from '@/components/forms/ActionForm';
import { Modal } from '@/components/ui/Modal';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { createPresentationAction, updatePresentationAction } from '@/app/actions/adminVentures';
import {
  PRESENTATION_STATUSES,
  PRESENTATION_STATUS_LABELS,
  type PresentationStatus,
} from '@/lib/constants/presentations';
import { toDateInputValue } from '@/lib/utils/dates';

export interface PresentationStudentOption {
  recordId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
}

export interface EditablePresentation {
  id: string;
  presentedOn: string;
  startTime: string | null;
  driveUrl: string | null;
  status: PresentationStatus;
  recordIds: string[];
  /** Students with mentor feedback on this presentation — they cannot be removed. */
  lockedRecordIds: string[];
}

/**
 * Adds a presentation to a stage, or edits one. The administrator picks any
 * number of the stage's students — searchable, and filterable by venture — and
 * the same student may be picked again for a later presentation.
 *
 * The parent remounts this per open (via `key`), so every open starts from the
 * presentation it was given.
 */
export function PresentationFormModal({
  open,
  onClose,
  ventureActivityId,
  students,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  ventureActivityId: string;
  students: PresentationStudentOption[];
  editing: EditablePresentation | null;
}) {
  const { notify } = useToast();
  const action: FormAction<unknown> = editing ? updatePresentationAction : createPresentationAction;
  const locked = useMemo(() => new Set(editing?.lockedRecordIds ?? []), [editing]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(editing?.recordIds ?? []));
  const [query, setQuery] = useState('');
  const [venture, setVenture] = useState('');

  const ventures = useMemo(
    () => [...new Set(students.map((s) => s.ventureName))].sort((a, b) => a.localeCompare(b)),
    [students],
  );

  const needle = query.trim().toLowerCase();
  const matches = (s: PresentationStudentOption) =>
    (!venture || s.ventureName === venture) &&
    (!needle ||
      s.studentName.toLowerCase().includes(needle) ||
      s.studentEmail.toLowerCase().includes(needle) ||
      s.ventureName.toLowerCase().includes(needle));
  const shown = students.filter(matches);

  function toggle(recordId: string, on: boolean) {
    if (!on && locked.has(recordId)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  function selectShown() {
    setSelected((current) => new Set([...current, ...shown.map((s) => s.recordId)]));
  }

  function clearShown() {
    const hide = new Set(shown.map((s) => s.recordId));
    setSelected((current) => new Set([...current].filter((id) => !hide.has(id) || locked.has(id))));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit presentation' : 'Add presentation'}
      description={
        editing
          ? 'Change the date, Drive link, status or students. Earlier presentations are not affected.'
          : 'A new presentation for this stage. It is added to the history — nothing earlier is replaced.'
      }
    >
      <ActionForm
        action={action}
        onSuccess={() => {
          notify({
            tone: 'success',
            title: editing ? 'Presentation updated' : 'Presentation added',
            description: editing
              ? undefined
              : 'Mark each student received once they have presented.',
          });
          onClose();
        }}
      >
        {({ fieldErrors }) => (
          <div className="space-y-4">
            {editing ? (
              <input type="hidden" name="presentationId" value={editing.id} />
            ) : (
              <input type="hidden" name="ventureActivityId" value={ventureActivityId} />
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Presentation date"
                htmlFor="presentedOn"
                required
                error={fieldErrors?.presentedOn}
              >
                <TextInput
                  id="presentedOn"
                  name="presentedOn"
                  type="date"
                  required
                  defaultValue={editing ? toDateInputValue(editing.presentedOn) : ''}
                />
              </Field>
              <Field
                label="Time"
                htmlFor="startTime"
                hint="Optional"
                error={fieldErrors?.startTime}
              >
                <TextInput
                  id="startTime"
                  name="startTime"
                  type="time"
                  defaultValue={editing?.startTime ?? ''}
                />
              </Field>
              <Field label="Status" htmlFor="status" error={fieldErrors?.status}>
                <Select id="status" name="status" defaultValue={editing?.status ?? 'SCHEDULED'}>
                  {PRESENTATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PRESENTATION_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Drive link"
              htmlFor="driveUrl"
              hint="The folder this presentation's decks go into. Can be added later."
              error={fieldErrors?.driveUrl}
            >
              <TextInput
                id="driveUrl"
                name="driveUrl"
                type="url"
                inputMode="url"
                placeholder="https://drive.google.com/drive/folders/…"
                defaultValue={editing?.driveUrl ?? ''}
              />
            </Field>

            <fieldset className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <legend className="text-sm font-medium">
                  Students
                  <span className="text-danger-soft-foreground ml-0.5" aria-hidden="true">
                    *
                  </span>
                </legend>
                <span className="type-caption tabular-nums" aria-live="polite">
                  {selected.size} selected
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <TextInput
                    type="search"
                    aria-label="Search students"
                    placeholder="Search name, email or venture"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select
                  aria-label="Filter by venture"
                  value={venture}
                  onChange={(event) => setVenture(event.target.value)}
                  className="sm:w-56"
                >
                  <option value="">All ventures</option>
                  {ventures.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={selectShown}>
                  Select {shown.length === students.length ? 'all' : 'shown'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearShown}>
                  Clear {shown.length === students.length ? 'all' : 'shown'}
                </Button>
              </div>

              {/* Every student is rendered and filtered with `hidden`, so a
                  selection hidden by the search is still submitted. */}
              <ul className="rounded-control divide-border max-h-72 divide-y overflow-y-auto border">
                {students.map((student) => {
                  const isLocked = locked.has(student.recordId);
                  return (
                    <li key={student.recordId} hidden={!matches(student)}>
                      <label className="hover:bg-surface-hover flex cursor-pointer items-center gap-3 px-3.5 py-2 transition-colors">
                        <input
                          type="checkbox"
                          name="studentRecordIds"
                          value={student.recordId}
                          checked={selected.has(student.recordId)}
                          onChange={(event) => toggle(student.recordId, event.target.checked)}
                          className="border-input-border accent-primary size-4 shrink-0 rounded border"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">
                            {student.studentName}
                          </span>
                          <span className="type-caption block truncate">
                            {student.ventureName}
                            {student.studentEmail ? ` · ${student.studentEmail}` : ''}
                          </span>
                        </span>
                        {isLocked ? (
                          <span
                            className="type-caption inline-flex shrink-0 items-center gap-1"
                            title="Has mentor feedback on this presentation"
                          >
                            <Lock className="size-3" aria-hidden="true" />
                            Has feedback
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
                {shown.length === 0 ? (
                  <li className="type-caption px-3.5 py-3">No students match.</li>
                ) : null}
              </ul>
              {fieldErrors?.studentRecordIds ? (
                <p className="text-danger-soft-foreground text-xs" role="alert">
                  {fieldErrors.studentRecordIds}
                </p>
              ) : null}
            </fieldset>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton pendingLabel="Saving…" disabled={selected.size === 0}>
                {editing ? 'Save changes' : 'Save presentation'}
              </SubmitButton>
            </div>
          </div>
        )}
      </ActionForm>
    </Modal>
  );
}
