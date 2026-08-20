'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarCheck, Eye, MailCheck, Send, Trash2, Undo2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { textCell } from '@/components/ui/dataTableModel';
import { WorkshopModeBadge, WorkshopStatusBadge } from '@/components/ui/Badge';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EditWorkshopForm } from './WorkshopForm';
import { SendWorkshopEmail, type WorkshopEmailState } from './SendWorkshopEmail';
import type { WorkshopValues } from './WorkshopFields';
import { deleteWorkshopAction, setWorkshopStatusAction } from '@/app/actions/adminWorkshops';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import {
  WORKSHOP_MODES,
  WORKSHOP_MODE_LABELS,
  WORKSHOP_STATUSES,
  WORKSHOP_STATUS_LABELS,
  WORKSHOP_TYPES,
  WORKSHOP_TYPE_LABELS,
  type WorkshopMode,
  type WorkshopStatus,
  type WorkshopType,
} from '@/lib/constants/workshops';

export interface WorkshopRow extends WorkshopValues, WorkshopEmailState {
  _id: string;
  status: WorkshopStatus;
  mode: WorkshopMode;
  workshopType: WorkshopType;
}

const COLUMNS: DataColumn[] = [
  { key: 'title', header: 'Workshop' },
  { key: 'type', header: 'Type', hideBelow: 'md' },
  { key: 'date', header: 'Date' },
  { key: 'time', header: 'Time', hideBelow: 'lg' },
  { key: 'mode', header: 'Mode', hideBelow: 'sm' },
  { key: 'where', header: 'Venue / Online', hideBelow: 'xl', clamp: true, toggleable: true },
  { key: 'host', header: 'Host', hideBelow: 'lg', toggleable: true },
  { key: 'speaker', header: 'Speaker', hideBelow: 'md' },
  { key: 'status', header: 'Status' },
  { key: 'email', header: 'Student email', hideBelow: 'lg', toggleable: true },
  { key: 'actions', header: 'Actions', align: 'right', sortable: false },
];

export function WorkshopTable({
  workshops,
  recipientCount,
}: {
  workshops: WorkshopRow[];
  /** Active students, so the send dialog can name who it is about to reach. */
  recipientCount: number;
}) {
  const [status, setStatus] = useState<'ALL' | WorkshopStatus>('ALL');
  const [mode, setMode] = useState<'ALL' | WorkshopMode>('ALL');
  const [type, setType] = useState<'ALL' | WorkshopType>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Free text, sorting and paging belong to DataTable; these are the filters it
  // cannot express, so they narrow the row set before it ever sees it.
  const filtered = useMemo(
    () =>
      workshops.filter((workshop) => {
        if (status !== 'ALL' && workshop.status !== status) return false;
        if (mode !== 'ALL' && workshop.mode !== mode) return false;
        if (type !== 'ALL' && workshop.workshopType !== type) return false;
        if (from && workshop.date < from) return false;
        if (to && workshop.date > to) return false;
        return true;
      }),
    [workshops, status, mode, type, from, to],
  );

  const narrowed = filtered.length !== workshops.length;

  const rows: DataRow[] = filtered.map((workshop) => ({
    id: workshop._id,
    cells: [
      {
        node: (
          <Link
            href={`/admin/academic/workshops/${workshop._id}`}
            className="hover:text-primary font-medium hover:underline"
          >
            {workshop.title}
          </Link>
        ),
        sort: workshop.title,
        text: workshop.title,
      },
      {
        node: (
          <span className="text-muted-foreground whitespace-nowrap">
            {WORKSHOP_TYPE_LABELS[workshop.workshopType]}
          </span>
        ),
        sort: WORKSHOP_TYPE_LABELS[workshop.workshopType],
        text: WORKSHOP_TYPE_LABELS[workshop.workshopType],
      },
      {
        node: <span className="whitespace-nowrap">{formatDate(workshop.date)}</span>,
        sort: workshop.date,
        text: formatDate(workshop.date),
      },
      {
        node: (
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            {workshop.startTime}&ndash;{workshop.endTime}
          </span>
        ),
        sort: workshop.startTime,
        text: `${workshop.startTime} ${workshop.endTime}`,
      },
      {
        node: <WorkshopModeBadge mode={workshop.mode} />,
        sort: workshop.mode,
        text: WORKSHOP_MODE_LABELS[workshop.mode],
      },
      textCell(workshop.mode === 'ONLINE' ? 'Online only' : workshop.venue),
      textCell(workshop.hostName),
      textCell(workshop.speakerName),
      {
        node: <WorkshopStatusBadge status={workshop.status} />,
        sort: workshop.status,
        text: WORKSHOP_STATUS_LABELS[workshop.status],
      },
      {
        node: workshop.isEmailSent ? (
          <span className="text-success-soft-foreground inline-flex items-center gap-1 whitespace-nowrap">
            <MailCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {formatDate(workshop.emailSentAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">Not sent</span>
        ),
        // Sorted so everything still to be announced groups together.
        sort: workshop.isEmailSent ? (workshop.emailSentAt ?? '1') : '',
        text: workshop.isEmailSent
          ? `Sent emailed ${formatDateTime(workshop.emailSentAt)}`
          : 'Not sent',
      },
      { node: <RowActions workshop={workshop} recipientCount={recipientCount} /> },
    ],
  }));

  return (
    <DataTable
      caption="Workshops"
      columns={COLUMNS}
      rows={rows}
      searchPlaceholder="Search title, host, speaker or venue"
      emptyTitle={narrowed ? 'No workshops match these filters' : 'No workshops yet'}
      emptyDescription={
        narrowed
          ? 'Widen the date range or clear the status and mode filters.'
          : 'Add the first workshop with the button above. It stays a draft until you publish it.'
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="workshop-filter-status">
            Filter by status
          </label>
          <select
            id="workshop-filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'ALL' | WorkshopStatus)}
            className={COMPACT_CONTROL_CLASSES}
          >
            <option value="ALL">All statuses</option>
            {WORKSHOP_STATUSES.map((option) => (
              <option key={option} value={option}>
                {WORKSHOP_STATUS_LABELS[option]}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="workshop-filter-type">
            Filter by type
          </label>
          <select
            id="workshop-filter-type"
            value={type}
            onChange={(event) => setType(event.target.value as 'ALL' | WorkshopType)}
            className={COMPACT_CONTROL_CLASSES}
          >
            <option value="ALL">All types</option>
            {WORKSHOP_TYPES.map((option) => (
              <option key={option} value={option}>
                {WORKSHOP_TYPE_LABELS[option]}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="workshop-filter-mode">
            Filter by mode
          </label>
          <select
            id="workshop-filter-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as 'ALL' | WorkshopMode)}
            className={COMPACT_CONTROL_CLASSES}
          >
            <option value="ALL">All modes</option>
            {WORKSHOP_MODES.map((option) => (
              <option key={option} value={option}>
                {WORKSHOP_MODE_LABELS[option]}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="workshop-filter-from">
            Filter from date
          </label>
          <input
            id="workshop-filter-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className={COMPACT_CONTROL_CLASSES}
          />

          <label className="sr-only" htmlFor="workshop-filter-to">
            Filter to date
          </label>
          <input
            id="workshop-filter-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className={COMPACT_CONTROL_CLASSES}
          />

          {narrowed ? (
            <button
              type="button"
              onClick={() => {
                setStatus('ALL');
                setMode('ALL');
                setType('ALL');
                setFrom('');
                setTo('');
              }}
              className="text-primary text-[13px] font-medium hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      }
    />
  );
}

/**
 * Row actions.
 *
 * View and Edit are always available. The status controls offered depend on
 * where the workshop is: publishing a completed workshop or "completing" a
 * cancelled one are not states anyone wants, so they are simply not shown
 * rather than shown and refused.
 */
function RowActions({
  workshop,
  recipientCount,
}: {
  workshop: WorkshopRow;
  recipientCount: number;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function changeStatus(next: WorkshopStatus, success: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('workshopId', workshop._id);
      formData.set('status', next);

      const result = await setWorkshopStatusAction(null, formData);

      notify(
        result.ok
          ? { tone: 'success', title: success, description: workshop.title }
          : { tone: 'error', title: 'Could not update the workshop', description: result.message },
      );
    });
  }

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('workshopId', workshop._id);

      const result = await deleteWorkshopAction(null, formData);
      setConfirmingDelete(false);

      notify(
        result.ok
          ? { tone: 'success', title: 'Workshop deleted', description: workshop.title }
          : { tone: 'error', title: 'Could not delete the workshop', description: result.message },
      );
    });
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Link
        href={`/admin/academic/workshops/${workshop._id}`}
        aria-label={`View ${workshop.title}`}
        className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control inline-flex size-8 items-center justify-center transition-colors"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>

      <EditWorkshopForm workshop={workshop} />

      {workshop.status === 'DRAFT' || workshop.status === 'CANCELLED' ? (
        <IconAction
          label={`Publish ${workshop.title}`}
          icon={Send}
          disabled={pending}
          onClick={() => changeStatus('PUBLISHED', 'Workshop published')}
        />
      ) : null}

      {workshop.status === 'PUBLISHED' ? (
        <>
          <SendWorkshopEmail
            workshopId={workshop._id}
            title={workshop.title}
            recipientCount={recipientCount}
            email={workshop}
          />
          <IconAction
            label={`Unpublish ${workshop.title}`}
            icon={Undo2}
            disabled={pending}
            onClick={() => changeStatus('DRAFT', 'Workshop moved back to draft')}
          />
          <IconAction
            label={`Mark ${workshop.title} as completed`}
            icon={CalendarCheck}
            disabled={pending}
            onClick={() => changeStatus('COMPLETED', 'Workshop marked as completed')}
          />
        </>
      ) : null}

      <IconAction
        label={`Delete ${workshop.title}`}
        icon={Trash2}
        tone="danger"
        disabled={pending}
        onClick={() => setConfirmingDelete(true)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        busy={pending}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={remove}
        title={`Delete “${workshop.title}”?`}
        confirmLabel="Delete workshop"
        message={
          <>
            <p>This removes the workshop and everything recorded on it. It cannot be undone.</p>
            <p className="text-muted-foreground mt-2">
              To take it off the schedule without losing the record, cancel it instead.
            </p>
          </>
        }
      />
    </div>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone = 'default',
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        tone === 'danger'
          ? 'text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground rounded-control disabled:text-subtle-foreground inline-flex size-8 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent'
          : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control disabled:text-subtle-foreground inline-flex size-8 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent'
      }
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}
