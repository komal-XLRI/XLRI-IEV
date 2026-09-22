'use client';

import { useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Download, FileSpreadsheet, FileText, Loader2, Printer, Table2 } from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/AnchoredMenu';
import { useToast } from '@/components/ui/Toast';
import type { ExportFormat } from '@/lib/export/types';

/**
 * Export control for any list or report.
 *
 * The current query string is forwarded verbatim to the export endpoint, which
 * parses it with the same schema the page used. That is what makes "preserve
 * the applied filters" true by construction rather than by remembering to
 * thread each filter through by hand.
 */
const OPTIONS: Array<{
  format: ExportFormat;
  label: string;
  hint: string;
  icon: typeof Download;
}> = [
  { format: 'xlsx', label: 'Excel', hint: '.xlsx workbook', icon: FileSpreadsheet },
  { format: 'csv', label: 'CSV', hint: '.csv file', icon: Table2 },
  { format: 'pdf', label: 'PDF', hint: '.pdf document', icon: FileText },
  { format: 'print', label: 'Print', hint: 'opens the print dialog', icon: Printer },
];

/**
 * A raw CSV drops the title/filter preamble and the summary footer, leaving a
 * bare grid. Offered only where an importer exists for the same records, so
 * "export, edit in Excel, re-import" is a supported round trip.
 */
const RAW_CSV_DATASETS = new Set([
  'students',
  'faculty',
  'mentors',
  'subjects',
  'venture-activities',
]);

export function ExportMenu({
  dataset,
  label = 'Export',
  extraParams,
  align = 'right',
}: {
  dataset: string;
  label?: string;
  /** Filters the page knows about that are not in the URL. */
  extraParams?: Record<string, string | undefined>;
  align?: 'left' | 'right';
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close when the route changes, without an effect that sets state.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  function buildUrl(format: ExportFormat, raw = false): string {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    params.set('format', format);
    if (raw) params.set('raw', '1');

    return `/api/export/${dataset}?${params.toString()}`;
  }

  async function run(format: ExportFormat, raw = false) {
    setOpen(false);

    if (format === 'print') {
      // A new tab keeps the current page state intact; the printable document
      // triggers window.print() itself once it has rendered.
      window.open(buildUrl('print'), '_blank', 'noopener,noreferrer');
      return;
    }

    setBusy(format);

    try {
      // Fetching rather than navigating lets a server-side failure surface as
      // a message instead of replacing the page with a raw error body.
      const response = await fetch(buildUrl(format, raw));

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Export failed');
      }

      const blob = await response.blob();
      const filename =
        parseFilename(response.headers.get('Content-Disposition')) ?? `${dataset}.${format}`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify({
        tone: 'error',
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className="surface-card border-input-border hover:bg-surface-hover hover:border-border-strong disabled:bg-muted disabled:text-muted-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
        {busy ? 'Preparing…' : label}
      </button>

      <AnchoredMenu
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        align={align}
        width={224}
        label="Export options"
      >
        <div>
          <p className="text-muted-foreground border-b px-3 py-2 text-xs">
            Exports the current filters and sort order.
          </p>
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.format}
                type="button"
                role="menuitem"
                onClick={() => run(option.format)}
                className="hover:bg-surface-hover flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
              >
                <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="text-muted-foreground block text-xs">{option.hint}</span>
                </span>
              </button>
            );
          })}

          {RAW_CSV_DATASETS.has(dataset) ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => run('csv', true)}
              className="hover:bg-surface-hover flex w-full items-center gap-2.5 border-t px-3 py-2 text-left text-sm transition-colors"
            >
              <Table2 className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">CSV for re-import</span>
                <span className="text-muted-foreground block text-xs">bare grid, no headings</span>
              </span>
            </button>
          ) : null}
        </div>
      </AnchoredMenu>
    </div>
  );
}

/** Prefers the RFC 5987 `filename*` form, falling back to plain `filename`. */
export function parseFilename(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // fall through to the plain form
    }
  }

  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1] ?? null;
}
