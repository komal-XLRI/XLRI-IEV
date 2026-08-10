'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, TextArea } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils/cn';
import type { ImportOutcome } from '@/lib/import/types';

export interface ImportColumnView {
  field: string;
  label: string;
  required: boolean;
  hint?: string;
}

/**
 * Two-step bulk import: validate, then commit.
 *
 * The preview runs the real schema server-side and reports per-row errors, so
 * an administrator can fix a 500-row spreadsheet before anything is written.
 * The commit re-validates rather than trusting the preview. That contract is
 * unchanged — what moved is where it happens: a dialog rather than a permanent
 * panel above every directory, so the record list stays the page's subject.
 */
export function ImportPanel({
  spec,
  title,
  description,
  columns,
}: {
  spec: string;
  title: string;
  description: string;
  columns: ImportColumnView[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);

  function reset() {
    setCsv('');
    setFileName(null);
    setFileSize(null);
    setOutcome(null);
    setError(null);
  }

  async function send(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'commit');
    setError(null);

    try {
      const response = await fetch(`/api/import/${spec}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, dryRun }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Import failed');
        setOutcome(null);
        return;
      }

      const result = body as ImportOutcome;
      setOutcome(result);

      if (!dryRun) {
        notify({
          tone: result.failedRows > 0 ? 'error' : 'success',
          title: `Imported ${result.createdRows} row${result.createdRows === 1 ? '' : 's'}`,
          description:
            result.failedRows > 0
              ? `${result.failedRows} failed while writing. See the details in the dialog.`
              : undefined,
        });
        // New records change every list on the page behind this dialog.
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setOutcome(null);
    setError(null);
    setFileName(file.name);
    setFileSize(file.size);
    setCsv(await file.text());
  }

  const canPreview = csv.trim() !== '' && busy === null;
  const canCommit = Boolean(outcome?.dryRun && (outcome?.validRows ?? 0) > 0 && busy === null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/import/${spec}`}
          download
          className="border-input-border hover:bg-surface-hover hover:border-border-strong rounded-control inline-flex items-center gap-1.5 border px-3 py-1.5 text-[13px] font-medium transition-colors"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Template
        </a>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <FileUp className="size-3.5" aria-hidden="true" />
          Import CSV
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={reset} disabled={busy !== null || (!csv && !outcome)}>
              Start over
            </Button>
            <span className="flex-1" />
            <Button variant="secondary" onClick={() => send(true)} disabled={!canPreview}>
              {busy === 'preview' ? 'Validating…' : 'Validate'}
            </Button>
            <Button onClick={() => send(false)} disabled={!canCommit}>
              <Upload className="size-3.5" aria-hidden="true" />
              {busy === 'commit'
                ? 'Importing…'
                : `Import ${outcome?.validRows ?? 0} valid row${outcome?.validRows === 1 ? '' : 's'}`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <StepList current={outcome ? (outcome.dryRun ? 3 : 4) : csv ? 2 : 1} />

          <div className="surface-sunken rounded-control border p-3">
            <p className="type-overline mb-2">Expected columns</p>
            <ul className="flex flex-wrap gap-1.5">
              {columns.map((column) => (
                <li key={column.field}>
                  <Badge tone={column.required ? 'info' : 'muted'}>
                    {column.label}
                    {column.required ? ' *' : ''}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="type-caption mt-2">
              Column order does not matter and header capitalisation is ignored. Download the
              template for a ready-made file.
            </p>
          </div>

          {error ? <FormMessage tone="error">{error}</FormMessage> : null}

          {/* Drop zone. The click target is the whole panel, and the hidden
              input keeps the native file picker available to the keyboard. */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void onFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              'rounded-control border-2 border-dashed px-4 py-6 text-center transition-colors',
              dragging ? 'border-primary bg-primary-soft' : 'border-input-border',
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              id={`import-file-${spec}`}
              onChange={(event) => onFile(event.target.files?.[0])}
            />

            {fileName ? (
              <div className="flex items-center justify-center gap-3">
                <span className="bg-primary-soft text-primary-soft-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-md">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-[13px] font-medium">{fileName}</span>
                  <span className="type-caption block">
                    {fileSize !== null ? `${(fileSize / 1024).toFixed(1)} KB · ` : ''}
                    {csv.split(/\r?\n/).filter(Boolean).length} line(s)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={reset}
                  aria-label={`Remove ${fileName}`}
                  className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-md p-1.5 transition-colors"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <FileUp className="text-muted-foreground mx-auto size-6" aria-hidden="true" />
                <p className="mt-2 text-[13px] font-medium">
                  Drop a CSV file here, or{' '}
                  <label
                    htmlFor={`import-file-${spec}`}
                    className="text-primary cursor-pointer underline underline-offset-2"
                  >
                    choose a file
                  </label>
                </p>
                <p className="type-caption mt-0.5">You can also paste the rows below.</p>
              </>
            )}
          </div>

          <Field label="CSV content" htmlFor={`csv-${spec}`}>
            <TextArea
              id={`csv-${spec}`}
              value={csv}
              onChange={(event) => {
                setCsv(event.target.value);
                setFileName(null);
                setFileSize(null);
                setOutcome(null);
              }}
              rows={7}
              className="font-mono text-xs"
              placeholder={`${columns.map((c) => c.label).join(',')}\n…`}
            />
          </Field>

          {outcome ? <ImportResult outcome={outcome} /> : null}
        </div>
      </Modal>
    </>
  );
}

/** Where the operator is in the upload → validate → confirm sequence. */
function StepList({ current }: { current: number }) {
  const steps = ['Choose a file', 'Validate', 'Review errors', 'Confirm import'];

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {steps.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;

        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
                done
                  ? 'bg-success text-success-foreground'
                  : active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {done ? <CheckCircle2 className="size-3" /> : number}
            </span>
            <span
              className={cn(
                'text-[12px]',
                active ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {step}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="bg-border h-px w-4" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ImportResult({ outcome }: { outcome: ImportOutcome }) {
  const problems = outcome.results.filter(
    (row) => row.status === 'error' || row.status === 'failed',
  );

  return (
    <div className="space-y-3">
      {outcome.fileErrors.length > 0 ? (
        <FormMessage tone="error">
          <span className="block font-medium">This file could not be read</span>
          <ul className="mt-1 list-disc pl-4">
            {outcome.fileErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </FormMessage>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Rows read" value={outcome.totalRows} />
        <Stat label="Valid" value={outcome.validRows} tone="positive" />
        <Stat
          label="With errors"
          value={outcome.invalidRows}
          tone={outcome.invalidRows > 0 ? 'warning' : 'neutral'}
        />
        <Stat
          label={outcome.dryRun ? 'Not yet imported' : 'Imported'}
          value={outcome.dryRun ? 0 : outcome.createdRows}
          tone={outcome.dryRun ? 'neutral' : 'positive'}
        />
      </div>

      {outcome.dryRun && outcome.validRows > 0 ? (
        <FormMessage tone="info">
          Nothing has been written yet. Review any errors below, then choose Import.
        </FormMessage>
      ) : null}

      {!outcome.dryRun ? (
        <FormMessage tone={outcome.failedRows > 0 ? 'error' : 'success'}>
          Imported {outcome.createdRows} row(s).
          {outcome.failedRows > 0 ? ` ${outcome.failedRows} failed while writing.` : ''}
          {outcome.invalidRows > 0 ? ` ${outcome.invalidRows} were skipped as invalid.` : ''}
        </FormMessage>
      ) : null}

      {problems.length > 0 ? (
        <div className="rounded-control overflow-hidden border">
          <p className="surface-sunken border-b px-3 py-2 text-[12px] font-medium">
            {problems.length} row(s) need attention
          </p>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Rows that could not be imported</caption>
              <thead>
                <tr>
                  {['Line', 'Row', 'Problem'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="bg-table-header text-table-header-foreground sticky top-0 border-b px-3 py-2 text-left text-[11px] font-semibold tracking-[0.06em] uppercase"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {problems.slice(0, 100).map((row) => (
                  <tr key={row.line} className="border-b last:border-b-0">
                    <td className="px-3 py-2 tabular-nums">{row.line}</td>
                    <td className="text-muted-foreground max-w-[14rem] truncate px-3 py-2 text-xs">
                      {Object.values(row.values).filter(Boolean).join(' · ')}
                    </td>
                    <td className="text-danger-soft-foreground px-3 py-2">
                      {row.errors.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  const colour = {
    neutral: '',
    positive: 'text-success-soft-foreground',
    warning: 'text-warning-soft-foreground',
  }[tone];

  return (
    <div className="surface-sunken rounded-control border px-3 py-2">
      <p className="type-caption">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', colour)}>{value}</p>
    </div>
  );
}
