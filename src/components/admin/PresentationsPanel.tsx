'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, Presentation } from 'lucide-react';
import { ActionForm } from '@/components/forms/ActionForm';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, EmptyState } from '@/components/ui/Card';
import { Field, TextInput } from '@/components/ui/Field';
import { ActivityStatusBadge, Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import {
  setPresentationFolderAction,
  setPresentationsReceivedAction,
} from '@/app/actions/adminVentures';
import {
  PRESENTATION_STAGE_LABELS,
  presentationStageState,
  type PresentationStageState,
} from '@/lib/rules/presentations';
import { formatDate } from '@/lib/utils/dates';
import type { StudentActivityStatus } from '@/lib/constants/status';

export interface PresentationChecklistRow {
  recordId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  status: StudentActivityStatus;
  receivedAt: string | null;
}

function isPresented(row: PresentationChecklistRow): boolean {
  return row.receivedAt !== null || row.status === 'COMPLETED';
}

const STAGE_TONE: Record<PresentationStageState, 'muted' | 'info' | 'warning' | 'success'> = {
  NO_STUDENTS: 'muted',
  COLLECTING: 'warning',
  AWAITING_FEEDBACK: 'info',
  COMPLETED: 'success',
};

/**
 * The presentation stage for one venture activity.
 *
 * Students present; the programme office collects every deck into one shared
 * Drive folder and ticks each student off here. Nothing is uploaded to this
 * application — the folder is the record, the checklist is the register.
 */
export function PresentationsPanel({
  ventureActivityId,
  folderUrl,
  rows,
}: {
  ventureActivityId: string;
  folderUrl: string | null;
  rows: PresentationChecklistRow[];
}) {
  // A completed stage has, by definition, been presented — including one
  // completed under the old review flow, which carries no received date.
  const savedIds = useMemo(
    () => new Set(rows.filter(isPresented).map((row) => row.recordId)),
    [rows],
  );
  const completedIds = useMemo(
    () => rows.filter((row) => row.status === 'COMPLETED').map((row) => row.recordId),
    [rows],
  );

  const [checked, setChecked] = useState<Set<string>>(() => new Set(savedIds));

  const stage = presentationStageState({
    total: rows.length,
    received: checked.size,
    completed: completedIds.length,
  });

  const dirty = checked.size !== savedIds.size || [...checked].some((id) => !savedIds.has(id));

  function toggle(recordId: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Presentations"
        description="Collect every student's presentation into one Drive folder, then tick each student off. The stage completes once feedback on the presentations is given."
        icon={Presentation}
        action={<Badge tone={STAGE_TONE[stage]}>{PRESENTATION_STAGE_LABELS[stage]}</Badge>}
      />

      <CardBody className="space-y-5">
        <ActionForm action={setPresentationFolderAction} successMessage="Folder link saved.">
          {({ fieldErrors }) => (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="ventureActivityId" value={ventureActivityId} />
              <Field
                label="Drive folder link"
                htmlFor="presentationFolderUrl"
                error={fieldErrors?.presentationFolderUrl}
                hint="Shown to students on this activity. Leave blank and save to remove it."
                className="min-w-0 flex-1"
              >
                <TextInput
                  id="presentationFolderUrl"
                  name="presentationFolderUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://drive.google.com/drive/folders/…"
                  defaultValue={folderUrl ?? ''}
                />
              </Field>
              <div className="flex shrink-0 items-center gap-2 sm:mb-5">
                <SubmitButton pendingLabel="Saving…">Save link</SubmitButton>
                {folderUrl ? (
                  <a
                    href={folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                  >
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    Open folder
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </div>
          )}
        </ActionForm>

        {rows.length === 0 ? (
          <EmptyState
            size="sm"
            title="Nobody is on this activity yet"
            description="Students appear here once their venture has been created."
          />
        ) : (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="type-overline">Presentations received</span>
              <span className="type-caption tabular-nums">
                {checked.size}/{rows.length}
              </span>
            </div>
            <MeterBar
              value={checked.size}
              max={rows.length}
              size="sm"
              tone={checked.size === rows.length ? 'success' : 'primary'}
              label="Presentations received"
            />
          </div>
        )}
      </CardBody>

      {rows.length > 0 ? (
        <ActionForm
          action={setPresentationsReceivedAction}
          successMessage="Presentation checklist saved."
          className="border-t"
        >
          {() => (
            <>
              <input type="hidden" name="ventureActivityId" value={ventureActivityId} />

              <ul className="divide-border divide-y">
                {rows.map((row) => {
                  // A completed stage cannot be un-presented from a checklist.
                  const locked = row.status === 'COMPLETED';
                  const isChecked = checked.has(row.recordId);

                  return (
                    <li key={row.recordId}>
                      <label className="hover:bg-surface-hover flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors has-disabled:cursor-default">
                        <input
                          type="checkbox"
                          name="receivedRecordIds"
                          value={row.recordId}
                          checked={isChecked}
                          disabled={locked}
                          onChange={(event) => toggle(row.recordId, event.target.checked)}
                          className="border-input-border accent-primary size-4 shrink-0 rounded border"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">
                            {row.studentName}
                          </span>
                          <span className="type-caption block truncate">
                            {row.ventureName}
                            {row.studentEmail ? ` · ${row.studentEmail}` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <ActivityStatusBadge state={row.status} />
                          {row.receivedAt ? (
                            <span className="type-caption">
                              Received {formatDate(row.receivedAt)}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <CardFooter className="justify-between">
                <span className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setChecked(new Set(rows.map((row) => row.recordId)))}
                  >
                    Tick all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setChecked(new Set(completedIds))}
                  >
                    Clear
                  </Button>
                </span>
                <span className="flex items-center gap-3">
                  {dirty ? <span className="type-caption">Unsaved changes</span> : null}
                  <SubmitButton pendingLabel="Saving…" disabled={!dirty}>
                    Save checklist
                  </SubmitButton>
                </span>
              </CardFooter>
            </>
          )}
        </ActionForm>
      ) : null}
    </Card>
  );
}
