import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { cellsFor } from './format';
import { BRAND_PDF_COLOURS, drawXlriLogo } from '@/lib/branding/pdfLogo';
import { formatDateTime } from '@/lib/utils/dates';
import type { AnyExportDataset } from './types';

/**
 * Paginated table renderer.
 *
 * pdf-lib is used rather than a headless browser because it is pure JS — no
 * Chromium download, no native binary, and it runs unchanged in any Node
 * runtime. The trade-off is that layout (pagination, column widths, clipping)
 * is ours to do, which is what most of this file is.
 */

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 36;

const TITLE_SIZE = 15;
const SUBTITLE_SIZE = 9;
const META_SIZE = 8;
const HEADER_SIZE = 8.5;
const BODY_SIZE = 8.5;
const FOOTER_SIZE = 7.5;

const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 20;
const CELL_PADDING = 5;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
// The column band takes the XLRI navy rather than a neutral charcoal, so the
// table itself reads as part of the letterhead.
const HEADER_BG = BRAND_PDF_COLOURS.navy;
const HEADER_INK = rgb(1, 1, 1);
const STRIPE = rgb(0.96, 0.97, 0.98);
const RULE = rgb(0.85, 0.87, 0.89);

const LOGO_HEIGHT = 26;
const MASTHEAD_SIZE = 9.5;
const MASTHEAD_SUB_SIZE = 7.5;

/**
 * The standard-14 fonts are WinAnsi-encoded, and pdf-lib throws on any
 * character outside that set. Map the typographic characters this app actually
 * produces, then drop anything else rather than failing the whole export.
 */
const CHARACTER_SUBSTITUTIONS: Record<string, string> = {
  '→': '->', // →
  '←': '<-',
  '✓': 'Y', // ✓
  '✔': 'Y',
  '✗': 'N',
  '·': '-', // ·
  '•': '-', // •
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-', // – en dash
  '—': '-', // — em dash
  '…': '...', // …
  ' ': ' ',
};

export function toWinAnsi(input: string): string {
  let output = '';

  for (const char of input) {
    const substitute = CHARACTER_SUBSTITUTIONS[char];
    if (substitute !== undefined) {
      output += substitute;
      continue;
    }

    const code = char.codePointAt(0) ?? 0;
    // Printable ASCII and Latin-1 supplement are safe; tab/newline are not
    // meaningful inside a table cell.
    if (code === 9 || code === 10 || code === 13) output += ' ';
    else if (code >= 0x20 && code <= 0xff) output += char;
    // Anything else (CJK, emoji, symbols) is dropped.
  }

  return output;
}

/** Truncates to fit `maxWidth`, appending an ellipsis when it has to cut. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  const ellipsis = '...';
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, size);
  let low = 0;
  let high = text.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, mid);
    if (font.widthOfTextAtSize(candidate, size) + ellipsisWidth <= maxWidth) low = mid;
    else high = mid - 1;
  }

  return low <= 0 ? '' : `${text.slice(0, low)}${ellipsis}`;
}

/** Wraps text to a width, returning at most `maxLines` lines. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) return [];

  const last = lines.length - 1;
  lines[last] = fit(lines[last]!, font, size, maxWidth);
  return lines;
}

/** Distributes the available width across columns using their width hints. */
function columnWidths(dataset: AnyExportDataset, available: number): number[] {
  const hints = dataset.columns.map((column) => Math.max(column.width ?? 12, 4));
  const total = hints.reduce((sum, hint) => sum + hint, 0);
  const MIN_WIDTH = 36;

  const raw = hints.map((hint) => (hint / total) * available);

  // Lift anything below the readable minimum, then take the difference back
  // from the columns that have room to spare.
  const lifted = raw.map((width) => Math.max(width, MIN_WIDTH));
  const overflow = lifted.reduce((sum, width) => sum + width, 0) - available;

  if (overflow <= 0) return lifted;

  const slack = lifted.map((width) => Math.max(width - MIN_WIDTH, 0));
  const slackTotal = slack.reduce((sum, value) => sum + value, 0);
  if (slackTotal <= 0) return lifted;

  return lifted.map((width, index) => width - (slack[index]! / slackTotal) * overflow);
}

export async function toPdf(dataset: AnyExportDataset): Promise<Uint8Array> {
  const { meta, columns, rows, summary } = dataset;

  const pdf = await PDFDocument.create();
  pdf.setTitle(toWinAnsi(meta.title));
  pdf.setAuthor(toWinAnsi(meta.generatedBy));
  pdf.setSubject(toWinAnsi(meta.subtitle ?? 'IEV programme report'));
  pdf.setCreator('IEV Activity Tracker - XLRI Xavier School of Management');
  pdf.setProducer('IEV Activity Tracker - XLRI Xavier School of Management');
  pdf.setCreationDate(meta.generatedAt);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [pageWidth, pageHeight] = A4_LANDSCAPE;
  const contentWidth = pageWidth - MARGIN * 2;
  const widths = columnWidths(dataset, contentWidth);

  const pages: PDFPage[] = [];
  let page = pdf.addPage(A4_LANDSCAPE);
  pages.push(page);
  let y = pageHeight - MARGIN;

  // ---- Masthead (first page only) ----------------------------------------
  // Institution first, then the system, then the report: the same order an
  // office would expect on headed paper.
  const logo = drawXlriLogo(page, { x: MARGIN, top: y, height: LOGO_HEIGHT });

  const mastheadX = MARGIN + logo.width + 12;
  page.drawLine({
    start: { x: mastheadX - 6, y: y - LOGO_HEIGHT },
    end: { x: mastheadX - 6, y },
    thickness: 0.7,
    color: RULE,
  });

  page.drawText('IEV Activity Tracker', {
    x: mastheadX,
    y: y - MASTHEAD_SIZE - 1,
    size: MASTHEAD_SIZE,
    font: bold,
    color: INK,
  });
  page.drawText('XLRI Xavier School of Management', {
    x: mastheadX,
    y: y - MASTHEAD_SIZE - MASTHEAD_SUB_SIZE - 5,
    size: MASTHEAD_SUB_SIZE,
    font: regular,
    color: MUTED,
  });

  // Provenance sits opposite the mark, where a reader looks for it on a report.
  const generatedOn = `Generated ${formatDateTime(meta.generatedAt)} UTC`;
  const generatedBy = `By ${meta.generatedBy}`;

  [generatedOn, generatedBy].forEach((line, index) => {
    const text = fit(toWinAnsi(line), regular, META_SIZE, contentWidth / 2);
    page.drawText(text, {
      x: pageWidth - MARGIN - regular.widthOfTextAtSize(text, META_SIZE),
      y: y - META_SIZE - index * (META_SIZE + 3) - 1,
      size: META_SIZE,
      font: regular,
      color: MUTED,
    });
  });

  y -= LOGO_HEIGHT + 8;

  // Navy rule with the lime segment from the 75-years mark leading it.
  page.drawRectangle({ x: MARGIN, y: y - 2, width: 34, height: 2, color: BRAND_PDF_COLOURS.lime });
  page.drawRectangle({
    x: MARGIN + 34,
    y: y - 2,
    width: contentWidth - 34,
    height: 2,
    color: BRAND_PDF_COLOURS.navy,
  });
  y -= 16;

  // ---- Report title ------------------------------------------------------
  page.drawText(fit(toWinAnsi(meta.title), bold, TITLE_SIZE, contentWidth), {
    x: MARGIN,
    y: y - TITLE_SIZE,
    size: TITLE_SIZE,
    font: bold,
    color: INK,
  });
  y -= TITLE_SIZE + 6;

  if (meta.subtitle) {
    page.drawText(fit(toWinAnsi(meta.subtitle), regular, SUBTITLE_SIZE, contentWidth), {
      x: MARGIN,
      y: y - SUBTITLE_SIZE,
      size: SUBTITLE_SIZE,
      font: regular,
      color: MUTED,
    });
    y -= SUBTITLE_SIZE + 6;
  }

  // Filters are laid out in two columns so a long filter set stays compact.
  const metaLines = [
    ...meta.filters.map((filter) => `${filter.label}: ${filter.value}`),
    ...(meta.sort ? [`Sorted by: ${meta.sort}`] : []),
    `Rows: ${rows.length}`,
  ];

  if (metaLines.length > 0) {
    const columnWidth = contentWidth / 2 - 8;
    const perColumn = Math.ceil(metaLines.length / 2);

    metaLines.forEach((line, index) => {
      const column = Math.floor(index / perColumn);
      const rowIndex = index % perColumn;
      page.drawText(fit(toWinAnsi(line), regular, META_SIZE, columnWidth), {
        x: MARGIN + column * (columnWidth + 16),
        y: y - META_SIZE - rowIndex * (META_SIZE + 3),
        size: META_SIZE,
        font: regular,
        color: MUTED,
      });
    });

    y -= perColumn * (META_SIZE + 3) + 8;
  }

  // ---- Table -------------------------------------------------------------
  const bottomLimit = MARGIN + 24; // leave room for the footer

  const drawHeaderRow = (target: PDFPage, top: number): number => {
    target.drawRectangle({
      x: MARGIN,
      y: top - HEADER_HEIGHT,
      width: contentWidth,
      height: HEADER_HEIGHT,
      color: HEADER_BG,
    });

    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = widths[index]!;
      const text = fit(toWinAnsi(column.header), bold, HEADER_SIZE, width - CELL_PADDING * 2);
      const textWidth = bold.widthOfTextAtSize(text, HEADER_SIZE);
      const offset =
        column.align === 'right'
          ? width - CELL_PADDING - textWidth
          : column.align === 'center'
            ? (width - textWidth) / 2
            : CELL_PADDING;

      target.drawText(text, {
        x: x + offset,
        y: top - HEADER_HEIGHT + (HEADER_HEIGHT - HEADER_SIZE) / 2 + 1.5,
        size: HEADER_SIZE,
        font: bold,
        color: HEADER_INK,
      });
      x += width;
    });

    return top - HEADER_HEIGHT;
  };

  if (rows.length === 0) {
    y = drawHeaderRow(page, y);
    page.drawText('No rows matched the selected filters.', {
      x: MARGIN + CELL_PADDING,
      y: y - ROW_HEIGHT + 4,
      size: BODY_SIZE,
      font: regular,
      color: MUTED,
    });
    y -= ROW_HEIGHT;
  } else {
    y = drawHeaderRow(page, y);

    rows.forEach((row, rowIndex) => {
      if (y - ROW_HEIGHT < bottomLimit) {
        page = pdf.addPage(A4_LANDSCAPE);
        pages.push(page);
        y = pageHeight - MARGIN;
        y = drawHeaderRow(page, y);
      }

      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: y - ROW_HEIGHT,
          width: contentWidth,
          height: ROW_HEIGHT,
          color: STRIPE,
        });
      }

      const cells = cellsFor(columns, row);
      let x = MARGIN;

      columns.forEach((column, index) => {
        const width = widths[index]!;
        const text = fit(
          toWinAnsi(cells[index] ?? ''),
          regular,
          BODY_SIZE,
          width - CELL_PADDING * 2,
        );
        const textWidth = regular.widthOfTextAtSize(text, BODY_SIZE);
        const offset =
          column.align === 'right'
            ? width - CELL_PADDING - textWidth
            : column.align === 'center'
              ? (width - textWidth) / 2
              : CELL_PADDING;

        page.drawText(text, {
          x: x + offset,
          y: y - ROW_HEIGHT + (ROW_HEIGHT - BODY_SIZE) / 2 + 1.5,
          size: BODY_SIZE,
          font: regular,
          color: INK,
        });
        x += width;
      });

      page.drawLine({
        start: { x: MARGIN, y: y - ROW_HEIGHT },
        end: { x: MARGIN + contentWidth, y: y - ROW_HEIGHT },
        thickness: 0.4,
        color: RULE,
      });

      y -= ROW_HEIGHT;
    });
  }

  // ---- Summary -----------------------------------------------------------
  if (summary && summary.length > 0) {
    y -= 10;
    for (const entry of summary) {
      if (y - 12 < bottomLimit) {
        page = pdf.addPage(A4_LANDSCAPE);
        pages.push(page);
        y = pageHeight - MARGIN;
      }

      const line = `${entry.label}: ${entry.value}`;
      page.drawText(fit(toWinAnsi(line), bold, META_SIZE, contentWidth), {
        x: MARGIN,
        y: y - META_SIZE,
        size: META_SIZE,
        font: bold,
        color: INK,
      });
      y -= META_SIZE + 4;
    }
  }

  // ---- Footers (second pass, now that the page count is known) -----------
  // Carries the branding onto continuation pages, which have no masthead: a
  // sheet that gets separated from page one still identifies itself.
  const footerLeft = toWinAnsi(
    `XLRI - IEV Activity Tracker | ${meta.title} | generated ${formatDateTime(meta.generatedAt)} UTC by ${meta.generatedBy}`,
  );

  pages.forEach((target, index) => {
    target.drawLine({
      start: { x: MARGIN, y: MARGIN - 6 },
      end: { x: pageWidth - MARGIN, y: MARGIN - 6 },
      thickness: 0.5,
      color: RULE,
    });

    target.drawText(fit(footerLeft, regular, FOOTER_SIZE, contentWidth - 90), {
      x: MARGIN,
      y: MARGIN - 16,
      size: FOOTER_SIZE,
      font: regular,
      color: MUTED,
    });

    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    target.drawText(pageLabel, {
      x: pageWidth - MARGIN - regular.widthOfTextAtSize(pageLabel, FOOTER_SIZE),
      y: MARGIN - 16,
      size: FOOTER_SIZE,
      font: regular,
      color: MUTED,
    });
  });

  return pdf.save();
}

export const __testables = { fit, wrap, columnWidths };
