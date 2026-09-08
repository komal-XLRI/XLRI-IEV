import { ExternalLink } from 'lucide-react';
import type { DataCell, DataColumn } from '@/components/ui/dataTableModel';
import { textCell } from '@/components/ui/dataTableModel';
import { formatDate } from '@/lib/utils/dates';

/**
 * The register's columns, shared by the administrator's table and the faculty
 * one so the two cannot drift apart.
 *
 * This module has no `'use client'` directive on purpose: the faculty page is
 * a Server Component and builds its own rows, which it could not do by calling
 * a function exported from a client module.
 */

export interface RecordingRow {
  _id: string;
  event: string;
  /** `yyyy-mm-dd`, so it sorts as a string and feeds the edit form's date input. */
  date: string;
  timings: string;
  batch: string;
  venue: string;
  zoomLink: string;
  meetingId: string;
  passcode: string;
  recordingLink: string;
  recordingPasscode: string;
}

/** Eleven columns is a lot for a phone, so all but the identifying few fold away. */
export const RECORDING_COLUMNS: DataColumn[] = [
  { key: 'index', header: '#', sortable: false, hideBelow: 'sm' },
  { key: 'event', header: 'Event' },
  { key: 'date', header: 'Date' },
  { key: 'timings', header: 'Timings', hideBelow: 'lg' },
  { key: 'batch', header: 'Batch', hideBelow: 'lg' },
  { key: 'venue', header: 'Venue', hideBelow: 'xl', toggleable: true },
  { key: 'zoomLink', header: 'Zoom link', hideBelow: 'xl', toggleable: true },
  { key: 'meetingId', header: 'Meeting ID', hideBelow: 'xl', toggleable: true },
  { key: 'passcode', header: 'Passcode', hideBelow: 'xl', toggleable: true },
  { key: 'recordingLink', header: 'Recording' },
  { key: 'recordingPasscode', header: 'Recording passcode', hideBelow: 'md' },
];

function linkCell(href: string, label: string, search: string): DataCell {
  if (!href) {
    return { node: <span className="text-muted-foreground">—</span>, sort: '', text: '' };
  }

  return {
    node: (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary inline-flex items-center gap-1.5 font-medium whitespace-nowrap hover:underline"
      >
        {label}
        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
      </a>
    ),
    sort: href,
    text: search,
  };
}

/** A passcode is copied character by character, so it is set in a mono face. */
function codeCell(value: string): DataCell {
  if (!value) {
    return { node: <span className="text-muted-foreground">—</span>, sort: '', text: '' };
  }
  return { node: <span className="font-mono text-[13px]">{value}</span>, sort: value, text: value };
}

/**
 * One row's cells, in column order. `index` is the row's place in the register
 * rather than a stored value, so re-sorting the table cannot renumber it.
 */
export function recordingCells(recording: RecordingRow, index: number): DataCell[] {
  return [
    {
      node: <span className="text-muted-foreground tabular-nums">{index + 1}</span>,
      sort: index,
    },
    {
      node: <span className="font-medium">{recording.event}</span>,
      sort: recording.event,
      text: recording.event,
    },
    {
      node: <span className="whitespace-nowrap">{formatDate(recording.date)}</span>,
      sort: recording.date,
      text: formatDate(recording.date),
    },
    {
      node: <span className="whitespace-nowrap">{recording.timings || '—'}</span>,
      sort: recording.timings,
      text: recording.timings,
    },
    textCell(recording.batch),
    textCell(recording.venue),
    linkCell(recording.zoomLink, 'Join', `zoom ${recording.zoomLink}`),
    {
      node: <span className="whitespace-nowrap tabular-nums">{recording.meetingId || '—'}</span>,
      sort: recording.meetingId,
      text: recording.meetingId,
    },
    codeCell(recording.passcode),
    linkCell(recording.recordingLink, 'Watch', `recording ${recording.recordingLink}`),
    codeCell(recording.recordingPasscode),
  ];
}
