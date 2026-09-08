'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { EditRecordingForm } from './RecordingForm';
import { RECORDING_COLUMNS, recordingCells, type RecordingRow } from './recordingTableModel';
import { deleteRecordingAction } from '@/app/actions/adminRecordings';

const COLUMNS: DataColumn[] = [
  ...RECORDING_COLUMNS,
  { key: 'actions', header: '', align: 'right', sortable: false },
];

/**
 * The register, with the row controls an administrator needs.
 *
 * No filter bar: the table's own search box already matches across the event,
 * batch, venue and links, and a row of selects above a list this shape would
 * be more to read than the list.
 */
export function RecordingTable({ recordings }: { recordings: RecordingRow[] }) {
  const rows: DataRow[] = recordings.map((recording, index) => ({
    id: recording._id,
    cells: [...recordingCells(recording, index), { node: <RowActions recording={recording} /> }],
  }));

  return (
    <DataTable
      caption="Recordings"
      columns={COLUMNS}
      rows={rows}
      searchPlaceholder="Search event, batch, venue or links"
      emptyTitle="Nothing in the register yet"
      emptyDescription="Add the first row with the button above."
    />
  );
}

/**
 * Copying the recording link is offered here rather than only inside the edit
 * dialog, because pasting it into an email is what an administrator does with
 * one most often, and opening a form to select a URL out of a text box is a
 * poor way to do it.
 */
function RowActions({ recording }: { recording: RecordingRow }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const label = `${recording.event} on ${recording.date}`;

  async function copyLink() {
    // The passcode goes with the link — a recording link on its own is not
    // something the person on the other end can open.
    const text = recording.recordingPasscode
      ? `${recording.recordingLink}\nPasscode: ${recording.recordingPasscode}`
      : recording.recordingLink;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context, and a silent
      // no-op would just look like a broken button.
      notify({
        tone: 'error',
        title: 'Could not copy the link',
        description: 'Open the recording and copy the address from the browser instead.',
      });
    }
  }

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('recordingId', recording._id);

      const result = await deleteRecordingAction(null, formData);
      setConfirmingDelete(false);

      notify(
        result.ok
          ? { tone: 'success', title: 'Row deleted', description: label }
          : { tone: 'error', title: 'Could not delete the row', description: result.message },
      );
    });
  }

  const CopyIcon = copied ? Check : Copy;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {recording.recordingLink ? (
        <button
          type="button"
          onClick={copyLink}
          aria-label={copied ? 'Recording link copied' : `Copy the recording link for ${label}`}
          title={copied ? 'Copied' : 'Copy recording link and passcode'}
          className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control inline-flex size-8 items-center justify-center transition-colors"
        >
          <CopyIcon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}

      <EditRecordingForm recording={recording} />

      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        disabled={pending}
        aria-label={`Delete ${label}`}
        title="Delete"
        className="text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground rounded-control disabled:text-subtle-foreground inline-flex size-8 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>

      <ConfirmDialog
        open={confirmingDelete}
        busy={pending}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={remove}
        title={`Delete the row for ${label}?`}
        confirmLabel="Delete row"
        message={<p>This removes the row and its links from the register. The files stay put.</p>}
      />
    </div>
  );
}
