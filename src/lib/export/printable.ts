import { cellsFor, headersFor } from './format';
import { LOGO_SVG } from '@/lib/branding/logoArt';
import { formatDateTime } from '@/lib/utils/dates';
import type { AnyExportDataset } from './types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A standalone, print-optimised page.
 *
 * Print is deliberately its own format rather than "PDF opened in a viewer":
 * the browser's own print dialog gives the user paper size, margins, scale and
 * "Save as PDF" for free, and repeated table headers via `thead` work natively.
 *
 * The logo is inlined rather than linked. The document has to survive being
 * saved to disk and mailed on, and a `<img src="/xlri-logo.svg">` would print
 * as a gap the moment it left this origin. It is also the static variant of the
 * artwork — the supplied file animates in from `opacity: 0`, and this page
 * calls `window.print()` on load, which would capture the mark mid-fade.
 *
 * Colours here are literal rather than themed: this is ink on paper, and it
 * must not follow whichever theme the person happened to be using.
 */
export function toPrintableHtml(
  dataset: AnyExportDataset,
  options: { auto?: boolean } = {},
): string {
  const { meta, columns, rows, summary } = dataset;

  const headers = headersFor(columns);
  const alignFor = (index: number) => columns[index]?.align ?? 'left';

  const filterChips = [
    ...meta.filters.map((filter) => `${filter.label}: ${filter.value}`),
    ...(meta.sort ? [`Sorted by: ${meta.sort}`] : []),
  ];

  const body = rows
    .map((row) => {
      const cells = cellsFor(columns, row)
        .map(
          (cell, index) =>
            `<td class="align-${alignFor(index)}">${escapeHtml(cell) || '<span class="empty">—</span>'}</td>`,
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)} · IEV Tracker · XLRI</title>
<style>
  :root { color-scheme: light; --navy: #1b4e9b; --lime: #bccf17; --ink: #16181d; --muted: #4a5057; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #fff;
    color: var(--ink);
    font: 12px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  /* ---- Letterhead ---- */
  .masthead { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .identity { display: flex; align-items: center; gap: 14px; min-width: 0; }
  /* Height is set, width follows the artwork's own ratio — never stretched. */
  .identity svg { height: 34px; width: auto; display: block; flex: none; }
  .identity .divider { width: 1px; align-self: stretch; min-height: 34px; background: #c9ced4; }
  .identity .names { min-width: 0; }
  .identity .system { font-size: 13px; font-weight: 600; }
  .identity .institution { font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .provenance { font-size: 10px; color: var(--muted); text-align: right; line-height: 1.7; }
  .provenance b { color: var(--ink); font-weight: 600; }
  .rule { display: flex; height: 3px; margin: 10px 0 16px; }
  .rule i { display: block; height: 100%; }
  .rule .lime { width: 46px; background: var(--lime); }
  .rule .navy { flex: 1; background: var(--navy); }

  /* ---- Report heading ---- */
  h1 { font-size: 19px; margin: 0 0 4px; }
  .subtitle { color: var(--muted); font-size: 12px; margin: 0 0 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .chip { background: #f1f5f9; border: 1px solid #dfe4ea; border-radius: 999px; padding: 2px 9px; font-size: 10.5px; color: #334155; }
  .chip b { font-weight: 600; }
  .count { margin: 10px 0 12px; font-size: 10.5px; color: var(--muted); }

  /* ---- Table ---- */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th {
    background: var(--navy); color: #fff; text-align: left; padding: 7px 8px;
    font-size: 10px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600;
  }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .align-right { text-align: right; font-variant-numeric: tabular-nums; }
  .align-center { text-align: center; }
  .empty { color: #aab2bb; }
  .summary { margin-top: 14px; font-size: 11px; border-top: 1px solid #dfe4ea; padding-top: 10px; }
  .summary div { padding: 3px 0; }
  .summary b { display: inline-block; min-width: 180px; }
  .none { padding: 24px; text-align: center; color: var(--muted); border: 1px dashed #c3cad2; border-radius: 8px; }

  /* ---- Screen-only controls ---- */
  .toolbar { margin-bottom: 18px; display: flex; gap: 8px; }
  .toolbar button {
    font: inherit; font-size: 12px; padding: 7px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid #c3cad2; background: #fff; color: var(--ink);
  }
  .toolbar button.primary { background: var(--navy); border-color: var(--navy); color: #fff; }
  .footnote { margin-top: 20px; font-size: 9.5px; color: var(--muted); border-top: 1px solid #e2e8f0; padding-top: 8px; }

  @media print {
    body { padding: 0; }
    .toolbar { display: none; }
    /* Repeat the column names on every printed page. */
    thead { display: table-header-group; }
    tr, .masthead { break-inside: avoid; }
    @page { size: A4 landscape; margin: 12mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>

  <header>
    <div class="masthead">
      <div class="identity">
        ${LOGO_SVG}
        <span class="divider" aria-hidden="true"></span>
        <span class="names">
          <span class="system">IEV Activity Tracker</span><br>
          <span class="institution">XLRI Xavier School of Management</span>
        </span>
      </div>
      <div class="provenance">
        <div><b>Generated</b> ${escapeHtml(formatDateTime(meta.generatedAt))} UTC</div>
        <div><b>By</b> ${escapeHtml(meta.generatedBy)}</div>
      </div>
    </div>

    <div class="rule" aria-hidden="true"><i class="lime"></i><i class="navy"></i></div>

    <h1>${escapeHtml(meta.title)}</h1>
    ${meta.subtitle ? `<p class="subtitle">${escapeHtml(meta.subtitle)}</p>` : ''}
    ${
      filterChips.length > 0
        ? `<div class="chips">${filterChips
            .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
            .join('')}</div>`
        : ''
    }
    <p class="count">${rows.length} row(s)</p>
  </header>

  ${
    rows.length === 0
      ? '<p class="none">No rows matched the selected filters.</p>'
      : `<table>
    <thead><tr>${headers
      .map((header, index) => `<th class="align-${alignFor(index)}">${escapeHtml(header)}</th>`)
      .join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table>`
  }

  ${
    summary && summary.length > 0
      ? `<div class="summary">${summary
          .map((entry) => `<div><b>${escapeHtml(entry.label)}</b> ${escapeHtml(entry.value)}</div>`)
          .join('')}</div>`
      : ''
  }

  <p class="footnote">XLRI Xavier School of Management · IEV Activity Tracker · This report reflects the data and filters recorded above at the time of generation.</p>

  ${options.auto === false ? '' : '<script>window.addEventListener("load", () => window.print());</script>'}
</body>
</html>`;
}
