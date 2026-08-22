'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FileUp,
  Table2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, TextArea } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils/cn';
import type { ImportOutcome } from '@/lib/import/types';
import { IMPORT_ACCEPT, IMPORT_FORMAT_LABEL } from '@/lib/import/formats';

/**
 * What the Import menu offers.
 *
 * The format picked here only filters the file dialog: the reader identifies a
 * file by its bytes, so choosing "CSV" and then picking a workbook still works.
 * Naming the formats is for the person who has a file in hand and wants to know
 * this screen will take it, which is not a question a lone "Import" answers.
 */
const SOURCES: Array<{
  key: string;
  label: string;
  hint: string;
  icon: typeof FileUp;
  accept?: string;
}> = [
  { key: 'xlsx', label: 'Excel workbook', hint: '.xlsx', icon: FileSpreadsheet, accept: '.xlsx' },
  { key: 'csv', label: 'CSV file', hint: '.csv', icon: Table2, accept: '.csv' },
  {
    key: 'tsv',
    label: 'Tab-separated',
    hint: '.tsv or .txt',
    icon: Table2,
    accept: '.tsv,.txt',
  },
  {
    key: 'paste',
    label: 'Paste rows',
    hint: 'copied straight out of a spreadsheet',
    icon: ClipboardPaste,
  },
];

/** Both templates carry the same columns; only the file type differs. */
const TEMPLATES: Array<{ format: string; label: string; hint: string; icon: typeof FileUp }> = [
  {
    format: 'xlsx',
    label: 'Excel template',
    hint: 'required columns marked',
    icon: FileSpreadsheet,
  },
  { format: 'csv', label: 'CSV template', hint: 'the same columns, plain', icon: Table2 },
];

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
  // The file itself, not its text: a spreadsheet is binary and is uploaded as
  // it stands rather than being decoded in the browser.
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Set when the menu asked for the paste box rather than a file, and cleared
  // once the dialog has rendered it — the field does not exist to focus yet at
  // the moment the menu item is clicked. A ref rather than state: nothing
  // renders differently for it, and a state flag here would only buy a second
  // render pass to switch itself back off.
  const focusPaste = useRef(false);

  // Same dismissal contract as the Export menu beside it: click anywhere else,
  // or press Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!open || !focusPaste.current) return;
    focusPaste.current = false;
    document.getElementById(`csv-${spec}`)?.focus();
  }, [open, spec]);

  /**
   * Opens the native file dialog.
   *
   * The input lives at the root of this component rather than inside the
   * dialog so it is mounted when a menu item is clicked: opening a picker has
   * to happen inside the click that asked for it, and an input rendered by the
   * same state change does not exist yet.
   */
  function openPicker(accept: string) {
    const input = fileRef.current;
    if (!input) return;

    input.accept = accept;
    // Choosing the same file twice fires no change event unless the value is
    // cleared first, which reads as the dialog having silently ignored you.
    input.value = '';
    input.click();
  }

  function startImport(source: (typeof SOURCES)[number]) {
    setMenuOpen(false);
    setOpen(true);

    if (source.accept) openPicker(source.accept);
    else focusPaste.current = true;
  }

  function reset() {
    setCsv('');
    setFile(null);
    setFileName(null);
    setFileSize(null);
    setOutcome(null);
    setError(null);
  }

  async function send(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'commit');
    setError(null);

    try {
      let response: Response;

      if (file) {
        const payload = new FormData();
        payload.set('file', file);
        payload.set('dryRun', String(dryRun));

        // No Content-Type header: the browser has to set the multipart
        // boundary itself, and naming the type strips it.
        response = await fetch(`/api/import/${spec}`, { method: 'POST', body: payload });
      } else {
        response = await fetch(`/api/import/${spec}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv, dryRun }),
        });
      }

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Import failed');
        setOutcome(null);
        return;
      }

      const result = body as ImportOutcome;
      setOutcome(result);

      if (!dryRun) {
        const written = result.createdRows + result.updatedRows;

        notify({
          tone: result.failedRows > 0 ? 'error' : 'success',
          title: `Imported ${written} row${written === 1 ? '' : 's'}`,
          description:
            result.failedRows > 0
              ? `${result.failedRows} failed while writing. See the details in the dialog.`
              : result.updatedRows > 0
                ? `${result.createdRows} created, ${result.updatedRows} updated.`
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

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;

    setOutcome(null);
    setError(null);
    setFile(chosen);
    setFileName(chosen.name);
    setFileSize(chosen.size);

    // A spreadsheet has no meaningful text form, so the preview box stays
    // empty for it rather than filling with binary. The file is still what
    // gets uploaded either way.
    if (/\.(csv|tsv|txt)$/i.test(chosen.name)) setCsv(await chosen.text());
    else setCsv('');
  }

  const canPreview = (file !== null || csv.trim() !== '') && busy === null;
  const canCommit = Boolean(outcome?.dryRun && (outcome?.validRows ?? 0) > 0 && busy === null);

  return (
    <>
      <div ref={menuRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="surface-card border-input-border hover:bg-surface-hover hover:border-border-strong inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <FileUp className="size-4" aria-hidden="true" />
          Import
          <ChevronDown
            className={cn(
              'text-muted-foreground size-3.5 transition-transform',
              menuOpen && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="surface-overlay absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg"
          >
            <p className="text-muted-foreground border-b px-3 py-2 text-xs">
              Every format lands in the same preview. Nothing is written until you confirm it.
            </p>

            {SOURCES.map((source) => {
              const Icon = source.icon;
              return (
                <button
                  key={source.key}
                  type="button"
                  role="menuitem"
                  onClick={() => startImport(source)}
                  className="hover:bg-surface-hover flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{source.label}</span>
                    <span className="text-muted-foreground block text-xs">{source.hint}</span>
                  </span>
                </button>
              );
            })}

            {/* Templates sit in the same menu as the formats they produce: a
                blank file and the import that consumes it are one errand, and
                splitting them across two controls of different weights was
                what made the old row look accidental. */}
            <p className="text-muted-foreground border-t border-b px-3 py-2 text-xs">
              Start from a blank file
            </p>

            {TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <a
                  key={template.format}
                  role="menuitem"
                  href={
                    template.format === 'xlsx'
                      ? `/api/import/${spec}?format=xlsx`
                      : `/api/import/${spec}`
                  }
                  download
                  onClick={() => setMenuOpen(false)}
                  className="hover:bg-surface-hover flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
                >
                  {/* Format icon leads, as it does for the sources above, so
                      the two lists share one column of meaning. The download
                      glyph trails to mark the rows that leave the page. */}
                  <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{template.label}</span>
                    <span className="text-muted-foreground block text-xs">{template.hint}</span>
                  </span>
                  <Download
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                </a>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Mounted here, not in the dialog, so a menu item can open it within
          the same click. See openPicker. */}
      <input
        ref={fileRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0])}
      />

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
          <StepList current={outcome ? (outcome.dryRun ? 3 : 4) : file || csv ? 2 : 1} />

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
              Column order does not matter and header capitalisation is ignored — “Roll Number”,
              “rollNumber” and “roll_number” are the same column. Download a template for a
              ready-made file.
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
            {fileName ? (
              <div className="flex items-center justify-center gap-3">
                <span className="bg-primary-soft text-primary-soft-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-md">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-[13px] font-medium">{fileName}</span>
                  <span className="type-caption block">
                    {fileSize !== null ? `${(fileSize / 1024).toFixed(1)} KB` : ''}
                    {/* A workbook has no text form here, so there is no
                        line count to show for one. Claiming "0 line(s)"
                        for a file about to import fine reads as a refusal. */}
                    {csv ? ` · ${csv.split(/\r?\n/).filter(Boolean).length} line(s)` : ''}
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
                  Drop a spreadsheet or CSV here, or{' '}
                  <button
                    type="button"
                    onClick={() => openPicker(IMPORT_ACCEPT)}
                    className="text-primary cursor-pointer underline underline-offset-2"
                  >
                    choose a file
                  </button>
                </p>
                <p className="type-caption mt-0.5">
                  {IMPORT_FORMAT_LABEL} — or paste the rows below.
                </p>
              </>
            )}
          </div>

          <Field
            label="Or paste the rows"
            htmlFor={`csv-${spec}`}
            hint="Copying a block straight out of Excel works — tab-separated is understood."
          >
            <TextArea
              id={`csv-${spec}`}
              value={csv}
              onChange={(event) => {
                setCsv(event.target.value);
                // Typing replaces a chosen file rather than racing it.
                setFile(null);
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

  // Naming the records about to be replaced is the whole point of previewing
  // an edit: a count tells you something will be overwritten, this tells you
  // what, while there is still a chance to fix the file.
  const replacements = outcome.results.filter((row) => row.notes.length > 0);

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

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Rows read" value={outcome.totalRows} />
        <Stat label="Valid" value={outcome.validRows} tone="positive" />
        <Stat
          label="With errors"
          value={outcome.invalidRows}
          tone={outcome.invalidRows > 0 ? 'warning' : 'neutral'}
        />
        <Stat
          label={outcome.dryRun ? 'To create' : 'Created'}
          value={outcome.dryRun ? outcome.validRows - outcome.updatedRows : outcome.createdRows}
          tone={outcome.dryRun ? 'neutral' : 'positive'}
        />
        {/* Replacing a record is the consequential half of an import, so it is
            counted separately and coloured to be noticed rather than folded
            into a single "imported" total. */}
        <Stat
          label={outcome.dryRun ? 'To update' : 'Updated'}
          value={outcome.updatedRows}
          tone={outcome.updatedRows > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {outcome.dryRun && outcome.validRows > 0 ? (
        <FormMessage tone={outcome.updatedRows > 0 ? 'warning' : 'info'}>
          Nothing has been written yet. Review any errors below, then choose Import.
          {outcome.updatedRows > 0
            ? ` ${outcome.updatedRows} row(s) will replace a record that already exists — only the columns you filled in are changed, and a blank cell leaves the current value alone.`
            : ''}
        </FormMessage>
      ) : null}

      {!outcome.dryRun ? (
        <FormMessage tone={outcome.failedRows > 0 ? 'error' : 'success'}>
          Created {outcome.createdRows} row(s)
          {outcome.updatedRows > 0 ? `, updated ${outcome.updatedRows}` : ''}.
          {outcome.failedRows > 0 ? ` ${outcome.failedRows} failed while writing.` : ''}
          {outcome.invalidRows > 0 ? ` ${outcome.invalidRows} were skipped as invalid.` : ''}
        </FormMessage>
      ) : null}

      {replacements.length > 0 ? (
        <div className="rounded-control overflow-hidden border">
          <p className="surface-sunken border-b px-3 py-2 text-[12px] font-medium">
            {replacements.length} row(s) will replace an existing record
          </p>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Rows that will update existing records</caption>
              <thead>
                <tr>
                  {['Line', 'Row', 'What will change'].map((header) => (
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
                {replacements.slice(0, 100).map((row) => (
                  <tr key={row.line} className="border-b last:border-b-0">
                    <td className="px-3 py-2 tabular-nums">{row.line}</td>
                    <td className="text-muted-foreground max-w-[14rem] truncate px-3 py-2 text-xs">
                      {Object.values(row.values).filter(Boolean).join(' · ')}
                    </td>
                    <td className="text-warning-soft-foreground px-3 py-2">
                      {row.notes.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
