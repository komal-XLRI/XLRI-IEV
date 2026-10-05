'use client';

import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import {
  ChevronDown,
  ExternalLink,
  MessagesSquare,
  Pencil,
  Plus,
  Presentation,
  QrCode,
  Trash2,
} from 'lucide-react';
import { FeedbackQrModal } from './FeedbackQrModal';
import {
  PresentationFormModal,
  type EditablePresentation,
  type PresentationStudentOption,
} from './PresentationFormModal';
import { MentorFeedbackEntries } from '@/components/venture/MentorFeedbackEntries';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Modal';
import { MeterBar } from '@/components/ui/Chart';
import { useToast } from '@/components/ui/Toast';
import {
  deletePresentationAction,
  setParticipantReceivedAction,
} from '@/app/actions/adminVentures';
import {
  PRESENTATION_STAGE_LABELS,
  presentationStageState,
  type PresentationStageState,
} from '@/lib/rules/presentations';
import { PRESENTATION_STATUS_LABELS, type PresentationStatus } from '@/lib/constants/presentations';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import type { StudentActivityStatus } from '@/lib/constants/status';
import type {
  MentorFeedbackEntry,
  PresentationFormView,
} from '@/services/ventures/mentorFeedbackService';
import { FeedbackFormModal } from './FeedbackFormModal';

function presentationLabel(number: number): string {
  return `Presentation ${String(number).padStart(2, '0')}`;
}

export interface StageStudentRow extends PresentationStudentOption {
  status: StudentActivityStatus;
  presented: boolean;
}

export interface PresentationParticipantRow {
  participantId: string;
  recordId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  marked: boolean;
  receivedAt: string | null;
  recordStatus: StudentActivityStatus;
}

export interface PresentationRow {
  id: string;
  presentedOn: string;
  startTime: string | null;
  driveUrl: string | null;
  status: PresentationStatus;
  migratedFromChecklist: boolean;
  participants: PresentationParticipantRow[];
}

type ParticipantFeedback = {
  counted: number;
  required: number;
  complete: boolean;
  /** Every response, newest first — superseded ones included, flagged. */
  entries: MentorFeedbackEntry[];
};

export interface PresentationFeedbackSummary {
  /** Each presentation's own form, keyed by presentation id; null = not configured. */
  forms: Record<string, PresentationFormView | null>;
  byParticipant: Record<string, ParticipantFeedback>;
  tally: { received: number; complete: number; responses: number };
}

const STAGE_TONE: Record<PresentationStageState, 'muted' | 'info' | 'warning' | 'success'> = {
  NO_STUDENTS: 'muted',
  COLLECTING: 'warning',
  AWAITING_FEEDBACK: 'info',
  COMPLETED: 'success',
};

const STATUS_TONE: Record<PresentationStatus, 'info' | 'success' | 'muted'> = {
  SCHEDULED: 'info',
  HELD: 'success',
  CANCELLED: 'muted',
};

/** "01 October 2026" — the card header has room for the full month. */
const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The presentations of one stage.
 *
 * A stage is presented in as many sittings as the programme office holds. Each
 * is added here with its date, its students and its Drive link, and kept as
 * history. Within a sitting every student is marked received on their own —
 * only a received student has a mentor-feedback QR, and only received students
 * are owed feedback. Each presentation shows its own mentor feedback.
 */
export function PresentationsPanel({
  ventureActivityId,
  students,
  presentations,
  feedback,
}: {
  ventureActivityId: string;
  students: StageStudentRow[];
  presentations: PresentationRow[];
  feedback: PresentationFeedbackSummary;
}) {
  const { notify } = useToast();
  const [formFor, setFormFor] = useState<EditablePresentation | 'new' | null>(null);
  const [qrFor, setQrFor] = useState<{
    participantId: string;
    studentName: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<PresentationRow | null>(null);
  const [formOf, setFormOf] = useState<{ id: string; number: number } | null>(null);
  const anyForm = Object.values(feedback.forms).some(Boolean);
  const [deletePending, startDelete] = useTransition();

  const stage = presentationStageState({
    total: students.length,
    received: students.filter((s) => s.presented).length,
    completed: students.filter((s) => s.status === 'COMPLETED').length,
  });
  const presentedCount = students.filter((s) => s.presented).length;

  function openEdit(presentation: PresentationRow) {
    setFormFor({
      id: presentation.id,
      presentedOn: presentation.presentedOn,
      startTime: presentation.startTime,
      driveUrl: presentation.driveUrl,
      status: presentation.status,
      recordIds: presentation.participants.map((p) => p.recordId),
      lockedRecordIds: presentation.participants
        .filter((p) => (feedback.byParticipant[p.participantId]?.entries.length ?? 0) > 0)
        .map((p) => p.recordId),
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startDelete(async () => {
      const result = await deletePresentationAction(target.id);
      setDeleting(null);
      if (result.ok) notify({ tone: 'success', title: 'Presentation deleted' });
      else notify({ tone: 'error', title: 'Could not delete', description: result.message });
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Presentations"
        description="Add each presentation with its date, students and Drive link, then mark every student received once they have presented. Only received students get a feedback QR."
        icon={Presentation}
        action={
          <span className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone={STAGE_TONE[stage]}>{PRESENTATION_STAGE_LABELS[stage]}</Badge>
            <Button
              type="button"
              size="sm"
              onClick={() => setFormFor('new')}
              disabled={students.length === 0}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add presentation
            </Button>
          </span>
        }
      />

      <CardBody className="space-y-5">
        {students.length === 0 ? (
          <EmptyState
            size="sm"
            title="Nobody is on this activity yet"
            description="Students appear here once their venture has been created."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="type-overline">Students presented</span>
                <span className="type-caption tabular-nums">
                  {presentedCount}/{students.length}
                </span>
              </div>
              <MeterBar
                value={presentedCount}
                max={students.length}
                size="sm"
                tone={presentedCount === students.length ? 'success' : 'primary'}
                label="Students presented"
              />
            </div>

            {anyForm ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="type-overline">Mentor feedback complete</span>
                  <span className="type-caption tabular-nums">
                    {feedback.tally.complete}/{feedback.tally.received}
                  </span>
                </div>
                {/* Out of received students only — a student who has not
                    presented is not owed feedback. */}
                <MeterBar
                  value={feedback.tally.complete}
                  max={Math.max(1, feedback.tally.received)}
                  size="sm"
                  tone={
                    feedback.tally.received > 0 &&
                    feedback.tally.complete === feedback.tally.received
                      ? 'success'
                      : 'accent'
                  }
                  label="Mentor feedback complete"
                />
              </div>
            ) : null}
          </div>
        )}

        {students.length > 0 ? (
          presentations.length === 0 ? (
            <EmptyState
              size="sm"
              title="No presentations yet"
              description="Use “Add presentation” to schedule the first one for this stage."
            />
          ) : (
            <ul className="space-y-3">
              {presentations.map((presentation, index) => (
                <PresentationCard
                  key={presentation.id}
                  number={index + 1}
                  // The latest presentation is the one being worked on.
                  defaultOpen={index === presentations.length - 1}
                  presentation={presentation}
                  feedback={feedback}
                  onEdit={() => openEdit(presentation)}
                  onDelete={() => setDeleting(presentation)}
                  onConfigureForm={() => setFormOf({ id: presentation.id, number: index + 1 })}
                  onQr={(participant) =>
                    setQrFor({
                      participantId: participant.participantId,
                      studentName: participant.studentName,
                    })
                  }
                />
              ))}
            </ul>
          )
        ) : null}
      </CardBody>

      <PresentationFormModal
        key={formFor === null ? 'closed' : formFor === 'new' ? 'new' : formFor.id}
        open={formFor !== null}
        onClose={() => setFormFor(null)}
        ventureActivityId={ventureActivityId}
        students={students}
        editing={formFor === null || formFor === 'new' ? null : formFor}
      />

      <FeedbackFormModal
        key={formOf?.id ?? 'closed'}
        open={formOf !== null}
        onClose={() => setFormOf(null)}
        presentationId={formOf?.id ?? ''}
        presentationLabel={formOf ? presentationLabel(formOf.number) : ''}
        current={formOf ? (feedback.forms[formOf.id] ?? null) : null}
        // Other presentations' forms, offered only as something to copy from.
        copySources={presentations.flatMap((p, index) => {
          const form = feedback.forms[p.id];
          return form && p.id !== formOf?.id ? [{ label: presentationLabel(index + 1), form }] : [];
        })}
      />

      <FeedbackQrModal
        key={qrFor?.participantId ?? 'closed'}
        participantId={qrFor?.participantId ?? null}
        studentName={qrFor?.studentName ?? ''}
        onClose={() => setQrFor(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={deletePending}
        title="Delete this presentation?"
        confirmLabel="Delete presentation"
        message={
          deleting ? (
            <>
              The presentation on{' '}
              <span className="font-medium">{formatDate(deleting.presentedOn)}</span> and its{' '}
              {deleting.participants.length} student(s) will be removed. A presentation that already
              has mentor feedback cannot be deleted — set it to Cancelled instead.
            </>
          ) : null
        }
      />
    </Card>
  );
}

/** Smooth open/close without measuring heights: a 0fr → 1fr grid row. */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

function PresentationCard({
  number,
  defaultOpen,
  presentation,
  feedback,
  onEdit,
  onDelete,
  onConfigureForm,
  onQr,
}: {
  number: number;
  defaultOpen: boolean;
  presentation: PresentationRow;
  feedback: PresentationFeedbackSummary;
  onEdit: () => void;
  onDelete: () => void;
  onConfigureForm: () => void;
  onQr: (participant: PresentationParticipantRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const form = feedback.forms[presentation.id] ?? null;
  const cancelled = presentation.status === 'CANCELLED';
  const total = presentation.participants.length;
  const received = cancelled ? 0 : presentation.participants.filter((p) => p.marked).length;
  const responses = presentation.participants.reduce(
    (sum, p) => sum + (feedback.byParticipant[p.participantId]?.counted ?? 0),
    0,
  );
  const label = presentationLabel(number);

  return (
    <li className="rounded-control bg-surface overflow-hidden border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-surface-hover flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold">{label}</span>
            <span className="text-muted-foreground text-[13px]">
              {LONG_DATE.format(new Date(presentation.presentedOn))}
              {presentation.startTime ? ` · ${presentation.startTime}` : ''}
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{plural(total, 'Student')}</Badge>
            <Badge tone={received > 0 ? 'success' : 'muted'}>{received} Received</Badge>
            {total - received > 0 ? <Badge tone="muted">{total - received} Pending</Badge> : null}
            <Badge tone={responses > 0 ? 'info' : 'muted'}>{plural(responses, 'Feedback')}</Badge>
          </span>
        </span>
        <Badge tone={STATUS_TONE[presentation.status]}>
          {PRESENTATION_STATUS_LABELS[presentation.status]}
        </Badge>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <Collapsible open={open}>
        <div className="border-t">
          {/* Details: one row, not a list. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Detail label="Date">
              {formatDate(presentation.presentedOn)}
              {presentation.startTime ? `, ${presentation.startTime}` : ''}
            </Detail>
            <Detail label="Students">{plural(total, 'student')}</Detail>
            {presentation.migratedFromChecklist ? (
              <Detail label="Source">Earlier checklist</Detail>
            ) : null}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {presentation.driveUrl ? (
                <a
                  href={presentation.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors"
                >
                  Open Drive
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="type-caption">No Drive link yet</span>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                aria-label="Delete presentation"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </span>
          </div>

          {cancelled ? (
            <p className="type-caption border-t px-4 py-2">
              This presentation is cancelled, so its feedback QRs are switched off.
            </p>
          ) : null}

          {/* Students */}
          <div className="border-t">
            <div className="type-overline hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_8.5rem_8rem_5.5rem] items-center gap-3 px-4 py-2 md:grid">
              <span>Student</span>
              <span>Venture</span>
              <span>Status</span>
              <span>QR</span>
              <span className="text-right">Feedback</span>
            </div>
            <ul className="divide-border divide-y md:border-t">
              {presentation.participants.map((participant) => (
                <ParticipantRow
                  key={participant.participantId}
                  participant={participant}
                  cancelled={cancelled}
                  summary={feedback.byParticipant[participant.participantId]}
                  formConfigured={form !== null}
                  onQr={() => onQr(participant)}
                />
              ))}
            </ul>
          </div>

          <PresentationFeedback
            presentation={presentation}
            form={form}
            feedback={feedback}
            responses={responses}
            eligible={received}
            onConfigure={onConfigureForm}
          />
        </div>
      </Collapsible>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="type-overline">{label}</span>
      <span className="text-[13px] font-medium">{children}</span>
    </span>
  );
}

/**
 * One student in one presentation. The Received box saves as soon as it is
 * changed — the server decides, and the QR follows the saved state only.
 * A table row on wide screens; a compact card on narrow ones.
 */
function ParticipantRow({
  participant,
  cancelled,
  summary,
  formConfigured,
  onQr,
}: {
  participant: PresentationParticipantRow;
  cancelled: boolean;
  summary?: ParticipantFeedback;
  formConfigured: boolean;
  onQr: () => void;
}) {
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(participant.marked);

  function toggle(next: boolean) {
    startTransition(async () => {
      setShown(next);
      const result = await setParticipantReceivedAction(participant.participantId, next);
      if (!result.ok) {
        notify({ tone: 'error', title: 'Could not save', description: result.message });
      } else if (result.data.stageCompleted) {
        notify({
          tone: 'success',
          title: `${participant.studentName} completed this stage`,
          description: 'Their feedback was already in, so the next stage is unlocked.',
        });
      }
    });
  }

  const received = participant.marked && !cancelled;
  const showReceived = shown && !cancelled;
  const counted = summary?.counted ?? 0;

  return (
    <li className="hover:bg-surface-hover grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_8.5rem_8rem_5.5rem]">
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium">{participant.studentName}</span>
        {/* On narrow screens the venture sits under the name. */}
        <span className="type-caption block truncate md:hidden">{participant.ventureName}</span>
      </span>
      <span className="type-secondary hidden truncate md:block">{participant.ventureName}</span>

      <label
        className="flex cursor-pointer items-center gap-2 has-disabled:cursor-default"
        title={cancelled ? 'The presentation is cancelled' : 'Tick once this student has presented'}
      >
        <input
          type="checkbox"
          checked={shown}
          disabled={pending || cancelled}
          onChange={(event) => toggle(event.target.checked)}
          aria-label={`${participant.studentName} presentation received`}
          className="border-input-border accent-primary size-4 shrink-0 rounded border"
        />
        <Badge tone={showReceived ? 'success' : 'muted'}>
          {showReceived ? 'Received' : 'Pending'}
        </Badge>
      </label>

      <span className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:contents">
        <span>
          {received && !pending && formConfigured ? (
            <Button type="button" variant="secondary" size="sm" onClick={onQr}>
              <QrCode className="size-3.5" aria-hidden="true" />
              View QR
            </Button>
          ) : received && !pending ? (
            <span
              className="type-caption"
              title="Configure this presentation's feedback form to enable the QR."
            >
              Form not set
            </span>
          ) : (
            <span
              className="type-caption"
              title="Presentation not received. QR is unavailable until this student is marked Received."
            >
              {pending ? 'Saving…' : 'QR unavailable'}
            </span>
          )}
        </span>
        <span className="text-right text-[12.5px] tabular-nums">
          <span className={cn('font-medium', counted === 0 && 'text-muted-foreground')}>
            {counted}
            {formConfigured ? `/${summary?.required ?? 1}` : ''}
          </span>
          {summary?.complete ? (
            <span className="text-success-soft-foreground block text-[11px] font-semibold">
              Complete
            </span>
          ) : participant.recordStatus === 'COMPLETED' ? (
            <span className="type-caption block">Stage done</span>
          ) : null}
        </span>
      </span>
    </li>
  );
}

/**
 * This presentation's mentor feedback, and only this presentation's: its own
 * Google Form, a summary line, then — on demand — every response, grouped by
 * student.
 */
function PresentationFeedback({
  presentation,
  form,
  feedback,
  responses,
  eligible,
  onConfigure,
}: {
  presentation: PresentationRow;
  form: PresentationFormView | null;
  feedback: PresentationFeedbackSummary;
  responses: number;
  /** Received students — the ones whose QR works. */
  eligible: number;
  onConfigure: () => void;
}) {
  const [open, setOpen] = useState(false);
  const withFeedback = presentation.participants.filter(
    (p) => (feedback.byParticipant[p.participantId]?.entries.length ?? 0) > 0,
  );

  const responsesButton =
    withFeedback.length > 0 ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide responses' : 'View responses'}
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>
    ) : null;

  return (
    <div className="surface-sunken border-t px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <MessagesSquare className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium">Mentor feedback</span>
            {form && !form.enabled ? <Badge tone="muted">Paused</Badge> : null}
          </span>
          {form ? (
            <span className="type-caption block">
              <span className="text-foreground font-medium">{form.title || 'Google Form'}</span>
              {' · '}
              {plural(responses, 'response')} · {plural(eligible, 'student')} eligible
            </span>
          ) : (
            <span className="type-caption block">
              No feedback form configured for this presentation.
            </span>
          )}
        </span>

        <span className="flex flex-wrap gap-2">
          {form ? (
            <>
              <a
                href={form.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors"
              >
                View form
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
              {responsesButton}
              <Button type="button" variant="ghost" size="sm" onClick={onConfigure}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit form
              </Button>
            </>
          ) : (
            <>
              {/* Feedback given before a form was removed is still history. */}
              {responsesButton}
              <Button type="button" size="sm" onClick={onConfigure}>
                <Plus className="size-3.5" aria-hidden="true" />
                Configure feedback form
              </Button>
            </>
          )}
        </span>
      </div>

      {form && responses === 0 && withFeedback.length === 0 ? (
        <p className="type-caption mt-2">
          No mentor feedback yet. Feedback submitted by mentors will appear here.
        </p>
      ) : null}

      {withFeedback.length > 0 ? (
        <Collapsible open={open}>
          <ul className="mt-3 space-y-2">
            {withFeedback.map((participant) => (
              <StudentFeedback
                key={participant.participantId}
                participant={participant}
                summary={feedback.byParticipant[participant.participantId]!}
              />
            ))}
          </ul>
        </Collapsible>
      ) : null}
    </div>
  );
}

/** One student's responses in one presentation, each mentor's kept separate. */
function StudentFeedback({
  participant,
  summary,
}: {
  participant: PresentationParticipantRow;
  summary: ParticipantFeedback;
}) {
  const [open, setOpen] = useState(false);
  const superseded = summary.entries.length - summary.counted;

  return (
    <li className="rounded-control bg-surface border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-surface-hover flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-left transition-colors"
      >
        <span className="min-w-0 flex-1 text-[13.5px] font-medium">
          {participant.studentName}
          <span className="text-muted-foreground font-normal"> — {participant.ventureName}</span>
        </span>
        <span className="type-caption tabular-nums">
          {plural(summary.counted, 'mentor response')}
          {superseded > 0 ? ` · ${superseded} replaced` : ''}
        </span>
        {summary.complete ? <Badge tone="success">Complete</Badge> : null}
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      <Collapsible open={open}>
        <div className="border-t p-3">
          {/* The association is the QR's, not whatever the form's student
              question says — make that visible where it matters. */}
          <p className="type-caption mb-2">
            Student from QR:{' '}
            <span className="text-foreground font-medium">
              {participant.studentName} — {participant.ventureName}
            </span>
          </p>
          <MentorFeedbackEntries entries={summary.entries} showSuperseded />
        </div>
      </Collapsible>
    </li>
  );
}
