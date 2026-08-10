'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/forms/ActionForm';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { updateSupportActivityAction } from '@/app/actions/studentActions';

export interface SupportRowView {
  recordId: string;
  status: string;
  notes: string;
  activityCode: string;
  name: string;
  description: string;
  scheduleType: string;
  feeds: string[];
}

const STATUS_TONE = {
  PENDING: 'neutral',
  IN_PROGRESS: 'info',
  UNDER_REVIEW: 'warning',
  COMPLETED: 'success',
  REVISION_REQUIRED: 'warning',
  REJECTED: 'danger',
} as const;

/** Students can move a record forward but not close it — that is a reviewer's call. */
const STUDENT_SELECTABLE = ['PENDING', 'IN_PROGRESS', 'UNDER_REVIEW'] as const;

export function SupportActivityRow({ row }: { row: SupportRowView }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold">{row.activityCode}</span>
            <p className="font-medium">{row.name}</p>
            <Badge tone={STATUS_TONE[row.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
              {row.status.replace(/_/g, ' ').toLowerCase()}
            </Badge>
          </div>

          {row.description ? (
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{row.description}</p>
          ) : null}

          <p className="text-muted-foreground mt-1 text-xs">
            {row.scheduleType.replace(/_/g, ' ').toLowerCase()} · supports{' '}
            <span className="font-mono">{row.feeds.length > 0 ? row.feeds.join(', ') : '—'}</span>
          </p>

          {row.notes ? <p className="mt-2 text-sm whitespace-pre-wrap">{row.notes}</p> : null}
        </div>

        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Update'}
        </Button>
      </div>

      {open ? (
        <ActionForm action={updateSupportActivityAction} successMessage="Updated." className="mt-3">
          {() => (
            <div className="surface-sunken space-y-3 rounded-lg p-3">
              <input type="hidden" name="recordId" value={row.recordId} />

              <Field label="Status" htmlFor={`status-${row.recordId}`} required>
                <Select
                  id={`status-${row.recordId}`}
                  name="status"
                  required
                  defaultValue={
                    STUDENT_SELECTABLE.includes(row.status as (typeof STUDENT_SELECTABLE)[number])
                      ? row.status
                      : 'IN_PROGRESS'
                  }
                >
                  {STUDENT_SELECTABLE.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Notes"
                htmlFor={`notes-${row.recordId}`}
                hint="What you attended or completed, and what you took from it."
              >
                <TextArea
                  id={`notes-${row.recordId}`}
                  name="notes"
                  rows={3}
                  defaultValue={row.notes}
                />
              </Field>

              <SubmitButton size="sm" pendingLabel="Saving…">
                Save
              </SubmitButton>
            </div>
          )}
        </ActionForm>
      ) : null}
    </li>
  );
}
