import 'server-only';
import { toCsv } from './csv';
import { toPrintableHtml } from './printable';
import {
  FORMAT_CONTENT_TYPE,
  FORMAT_EXTENSION,
  type AnyExportDataset,
  type ExportFormat,
} from './types';

/** `Student progress` + `2026-08-08T1015` → `student-progress-2026-08-08-1015.xlsx` */
export function buildFilename(base: string, at: Date, format: ExportFormat): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'export';

  const stamp = at.toISOString().slice(0, 16).replace('T', '-').replace(':', '');

  return `${slug}-${stamp}.${FORMAT_EXTENSION[format]}`;
}

/** RFC 5987 — keeps non-ASCII filenames intact without breaking older clients. */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  const type = inline ? 'inline' : 'attachment';

  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Renders a dataset in the requested format and wraps it in a response with
 * the right content type and download headers.
 *
 * `print` is served inline as HTML so the browser opens it and triggers its own
 * print dialog; everything else downloads as an attachment.
 */
export async function buildExportResponse(
  dataset: AnyExportDataset,
  format: ExportFormat,
  options: { raw?: boolean } = {},
): Promise<Response> {
  const filename = buildFilename(dataset.meta.fileBase, dataset.meta.generatedAt, format);

  const headers = new Headers({
    'Content-Type': FORMAT_CONTENT_TYPE[format],
    'Content-Disposition': contentDisposition(filename, format === 'print'),
    // Exports reflect live data and often contain personal information.
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });

  switch (format) {
    case 'csv':
      // `raw` drops the title/filter preamble and the summary footer, leaving
      // just the header row and the grid — so a CSV exported from a list can be
      // edited and fed straight back to the matching importer.
      return new Response(toCsv(dataset, options.raw ? { preamble: false, summary: false } : {}), {
        headers,
      });

    case 'print':
      return new Response(toPrintableHtml(dataset), { headers });

    case 'xlsx': {
      // Imported lazily so a CSV or print request never pays to load ExcelJS.
      const { toXlsx } = await import('./xlsx');
      const buffer = await toXlsx(dataset);
      return new Response(new Uint8Array(buffer), { headers });
    }

    case 'pdf': {
      const { toPdf } = await import('./pdf');
      const bytes = await toPdf(dataset);
      return new Response(bytes as unknown as BodyInit, { headers });
    }
  }
}
