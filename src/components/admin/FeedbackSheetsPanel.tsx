'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { deleteStageFeedbackSheetAction } from '@/app/actions/adminVentures';
import type { StageFeedbackSheetSummary } from '@/services/ventures/stageFeedbackSheetService';
import type { Serialized } from '@/lib/utils/serialize';
import { formatDate } from '@/lib/utils/dates';

type Sheet = Serialized<StageFeedbackSheetSummary>;

function UploadForm({ ventureActivityId }: { ventureActivityId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set('ventureActivityId', ventureActivityId);

    try {
      const response = await fetch('/api/stage-feedback-sheets', {
        method: 'POST',
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as
        Sheet | { error?: { message?: string } } | null;

      if (!response.ok || !body || !('id' in body)) {
        setError(
          (body && 'error' in body ? body.error?.message : undefined) ??
            'The sheet could not be uploaded.',
        );
        return;
      }

      formRef.current?.reset();
      notify({
        tone: 'success',
        title: 'Feedback sheet uploaded',
        description:
          body.unmatched.length > 0
            ? `Shared with ${body.matchedStudents} student(s). ${body.unmatched.length} row(s) matched nobody.`
            : `Shared with ${body.matchedStudents} student(s).`,
      });
      router.refresh();
    } catch {
      setError('The upload did not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <Field
        label="Title"
        htmlFor="sheet-title"
        hint="Shown to students. Defaults to the file name."
      >
        <TextInput
          id="sheet-title"
          name="title"
          maxLength={200}
          placeholder="e.g. Mentor panel feedback"
        />
      </Field>
      <Field
        label="Excel file"
        htmlFor="sheet-file"
        required
        hint='Needs a student name column, e.g. "Student &amp; Startup Names", or a roll number.'
      >
        <input
          id="sheet-file"
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="file:bg-secondary file:text-secondary-foreground file:border-input-border block w-full text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
        />
      </Field>
      <Button type="submit" disabled={busy} className="gap-1.5">
        <Upload className="size-3.5" aria-hidden="true" />
        {busy ? 'Uploading…' : 'Upload'}
      </Button>
      {error ? (
        <p role="alert" className="text-danger text-sm sm:col-span-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RemoveSheet({ sheet }: { sheet: Sheet }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('sheetId', sheet.id);
      const result = await deleteStageFeedbackSheetAction(null, formData);
      setOpen(false);
      notify(
        result.ok
          ? { tone: 'success', title: 'Feedback sheet removed' }
          : { tone: 'error', title: 'Could not remove the sheet', description: result.message },
      );
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title={`Remove "${sheet.title}"?`}
        confirmLabel="Remove"
        message={
          <p>
            The {sheet.matchedStudents} student(s) it was shared with will no longer see this
            feedback.
          </p>
        }
      />
    </>
  );
}

/**
 * Feedback spreadsheets for one stage. Each row is matched to a student by
 * roll number or email, and each student sees only their own row.
 */
export function FeedbackSheetsPanel({
  ventureActivityId,
  sheets,
}: {
  ventureActivityId: string;
  sheets: Sheet[];
}) {
  return (
    <Card className="mb-4">
      <CardHeader
        title="Feedback sheets"
        description='Upload an Excel sheet of feedback. Each row is matched to a student by name ("Name - Startup" works), roll number or student email. Each student sees only their own rows, one per evaluator, on their stage page. Evaluator email addresses are never shown to students.'
        icon={FileSpreadsheet}
        action={sheets.length > 0 ? <Badge tone="neutral">{sheets.length} uploaded</Badge> : null}
      />
      <CardBody className="space-y-4">
        <UploadForm ventureActivityId={ventureActivityId} />

        {sheets.length === 0 ? (
          <EmptyState
            size="sm"
            title="No feedback sheets yet"
            description="Uploaded sheets appear here with who they were shared with."
          />
        ) : (
          <ul className="divide-border rounded-control divide-y border">
            {sheets.map((sheet) => (
              <li key={sheet.id} className="space-y-2 px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <FileSpreadsheet
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{sheet.title}</span>
                    <span className="type-caption block">
                      {sheet.fileName} · {formatDate(sheet.uploadedAt)}
                      {sheet.uploadedByName ? ` · ${sheet.uploadedByName}` : ''} · matched on “
                      {sheet.matchedOn}”
                    </span>
                  </span>
                  <Badge tone="success">{sheet.matchedStudents} student(s)</Badge>
                  {sheet.unmatched.length > 0 ? (
                    <Badge tone="warning">{sheet.unmatched.length} unmatched</Badge>
                  ) : null}
                  <RemoveSheet sheet={sheet} />
                </div>

                <details className="type-caption">
                  <summary className="cursor-pointer select-none">
                    Shared with {sheet.students.length} student(s)
                    {sheet.unmatched.length > 0 ? ' and rows that matched nobody' : ''}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-foreground">
                      {sheet.students
                        .map((s) => (s.rollNumber ? `${s.name} (${s.rollNumber})` : s.name))
                        .join(', ')}
                    </p>
                    {sheet.unmatched.length > 0 ? (
                      <div>
                        <p className="type-overline">Not matched to any student</p>
                        <ul className="mt-1 space-y-0.5">
                          {sheet.unmatched.map((row) => (
                            <li key={row.line}>
                              Row {row.line}: {row.identifier || '(blank)'}
                              {row.reason ? (
                                <span className="text-muted-foreground"> — {row.reason}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
