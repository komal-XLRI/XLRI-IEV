import 'server-only';
import ExcelJS from 'exceljs';
import { XLRI_LOGO_PNG_BASE64, XLRI_LOGO_RASTER } from '@/lib/email/assets/xlriLogo';
import { nativeCell } from './format';
import type { AnyExportDataset, ColumnDef } from './types';

/**
 * Brand palette, in the ARGB Excel wants.
 *
 * Navy and lime are the logo's own colours, so the sheet and the mark on it
 * agree; the rest are neutrals chosen to stay legible when somebody prints
 * this in black and white, which is what happens to a report taken into a
 * meeting.
 */
const BRAND = {
  navy: 'FF1B4E9B',
  lime: 'FFBCCF17',
  ink: 'FF0F172A',
  muted: 'FF64748B',
  hairline: 'FFE2E8F0',
  band: 'FFF8FAFC',
} as const;

/** Rows the logo needs to sit in without overlapping the text beside it. */
const MASTHEAD_ROWS = 4;

/** Where the table starts, in columns, leaving room for the logo. */
const LOGO_COLUMNS = 2;

const hairline = {
  top: { style: 'thin' as const, color: { argb: BRAND.hairline } },
  bottom: { style: 'thin' as const, color: { argb: BRAND.hairline } },
  left: { style: 'thin' as const, color: { argb: BRAND.hairline } },
  right: { style: 'thin' as const, color: { argb: BRAND.hairline } },
};

/** Text columns wide enough that their content should wrap rather than run on. */
function wraps(column: ColumnDef<never>): boolean {
  return (column.type ?? 'text') === 'text' && (column.width ?? 0) >= 30;
}

/**
 * Real .xlsx, not a CSV with the wrong extension.
 *
 * Numbers stay numeric, dates stay dates, percentages carry a percent format,
 * the header row freezes and repeats on every printed page, and an autofilter
 * is applied so the recipient can slice the data further without asking for
 * another export.
 *
 * It is branded for the same reason the PDF is: these files leave the system.
 * A report forwarded to a director, or tabled at a meeting, should say on its
 * face where it came from and when — a bare grid of numbers with no masthead
 * is indistinguishable from something typed up by hand.
 */
export async function toXlsx(dataset: AnyExportDataset): Promise<Buffer> {
  const { meta, columns, rows, summary } = dataset;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IEV Activity Tracker';
  workbook.company = 'XLRI Delhi-NCR';
  workbook.created = meta.generatedAt;
  workbook.title = meta.title;

  const sheet = workbook.addWorksheet(sheetName(meta.title), {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  sheet.properties.defaultRowHeight = 16;

  const lastColumn = Math.max(columns.length, 3);
  const merge = (row: number, from = 1) => sheet.mergeCells(row, from, row, lastColumn);

  // ---- Masthead ----------------------------------------------------------
  // The logo is floated over the first rows rather than placed in a cell:
  // Excel has no concept of an image *in* a cell, and anchoring it to one
  // makes it move when the recipient sorts or filters.
  const logoId = workbook.addImage({
    base64: XLRI_LOGO_PNG_BASE64,
    extension: 'png',
  });

  const logoHeight = 44;
  const logoWidth = Math.round(
    logoHeight * (XLRI_LOGO_RASTER.width / XLRI_LOGO_RASTER.height),
  );

  sheet.addImage(logoId, {
    tl: { col: 0.25, row: 0.3 },
    ext: { width: logoWidth, height: logoHeight },
    editAs: 'absolute',
  });

  const titleRow = sheet.addRow([]);
  titleRow.height = 26;
  const titleCell = titleRow.getCell(LOGO_COLUMNS + 1);
  titleCell.value = meta.title;
  titleCell.font = { bold: true, size: 16, color: { argb: BRAND.ink } };
  titleCell.alignment = { vertical: 'middle' };
  merge(titleRow.number, LOGO_COLUMNS + 1);

  const subtitleRow = sheet.addRow([]);
  subtitleRow.height = 15;
  const subtitleCell = subtitleRow.getCell(LOGO_COLUMNS + 1);
  subtitleCell.value = meta.subtitle ?? 'XLRI Delhi-NCR · IEV Activity Tracker';
  subtitleCell.font = { size: 10, color: { argb: BRAND.muted } };
  merge(subtitleRow.number, LOGO_COLUMNS + 1);

  // ---- What shaped these rows -------------------------------------------
  // One line each, rather than a row per filter. Everything above the header
  // is frozen, so every preamble row is a row of the screen the recipient
  // never gets back — the old layout froze a dozen of them.
  const note = (text: string) => {
    const row = sheet.addRow([]);
    row.height = 14;
    const cell = row.getCell(LOGO_COLUMNS + 1);
    cell.value = text;
    cell.font = { size: 9.5, color: { argb: BRAND.muted } };
    merge(row.number, LOGO_COLUMNS + 1);
  };

  const shaping = [
    ...meta.filters.map((filter) => `${filter.label}: ${filter.value}`),
    ...(meta.sort ? [`Sorted by ${meta.sort}`] : []),
    `${rows.length} row${rows.length === 1 ? '' : 's'}`,
  ];

  note(shaping.join('  ·  '));
  note(`Generated ${formatStamp(meta.generatedAt)} by ${meta.generatedBy}`);

  // Keeps the masthead tall enough for the logo however short the title is.
  while (sheet.rowCount < MASTHEAD_ROWS) sheet.addRow([]);

  // A lime rule under the masthead, the one place the accent colour appears.
  const ruleRow = sheet.addRow([]);
  ruleRow.height = 4;
  for (let column = 1; column <= lastColumn; column += 1) {
    ruleRow.getCell(column).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND.lime },
    };
  }

  sheet.addRow([]);

  // ---- Header row --------------------------------------------------------
  const headerRow = sheet.addRow(columns.map((column) => column.header));
  headerRow.height = 30;
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  headerRow.eachCell((cell, index) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navy } };
    const column = columns[index - 1];
    if (column?.align) cell.alignment = { ...cell.alignment, horizontal: column.align };
  });

  const headerRowNumber = headerRow.number;

  // ---- Data --------------------------------------------------------------
  rows.forEach((row, rowIndex) => {
    const values = columns.map((column) => nativeCell(column.value(row), column.type));
    const added = sheet.addRow(values);

    // Banded, because these tables are wide: on a twelve-column row the eye
    // loses its place between the roll number and the last rating.
    const banded = rowIndex % 2 === 1;

    added.eachCell({ includeEmpty: true }, (cell, index) => {
      const column = columns[index - 1];
      if (!column) return;

      cell.border = hairline;

      if (banded) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.band } };
      }

      if (column.type === 'percent') cell.numFmt = '0%';
      else if (column.type === 'date') cell.numFmt = 'dd mmm yyyy';
      else if (column.type === 'datetime') cell.numFmt = 'dd mmm yyyy hh:mm';

      cell.alignment = {
        vertical: 'top',
        horizontal: column.align ?? 'left',
        wrapText: wraps(column),
      };
    });
  });

  // Freeze everything above the first data row, so the masthead and the
  // headings stay put while the recipient scrolls.
  sheet.views = [
    {
      state: 'frozen',
      ySplit: headerRowNumber,
      topLeftCell: `A${headerRowNumber + 1}`,
      activeCell: `A${headerRowNumber + 1}`,
    },
  ];

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + rows.length, column: columns.length },
    };

    // Repeat the headings on every printed page.
    sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
  }

  // ---- Summary -----------------------------------------------------------
  if (summary && summary.length > 0) {
    sheet.addRow([]);

    const heading = sheet.addRow(['Summary']);
    heading.font = { bold: true, size: 12, color: { argb: BRAND.navy } };
    merge(heading.number);

    for (const entry of summary) {
      const row = sheet.addRow([entry.label, entry.value]);
      row.getCell(1).font = { bold: true, size: 10, color: { argb: BRAND.ink } };
      row.getCell(1).alignment = { vertical: 'top' };
      row.getCell(2).font = { size: 10, color: { argb: BRAND.ink } };
      row.getCell(2).alignment = { vertical: 'top', wrapText: true };
      // Summary values are sentences — an average with its spread, or a survey
      // question in full — so they take the width of the table, not a column.
      sheet.mergeCells(row.number, 2, row.number, lastColumn);
    }
  }

  // ---- Column widths -----------------------------------------------------
  columns.forEach((column, index) => {
    const sheetColumn = sheet.getColumn(index + 1);

    // Sample the data so columns fit without walking every row of a big export.
    let longest = column.header.length;
    const sampleSize = Math.min(rows.length, 200);
    for (let i = 0; i < sampleSize; i += 1) {
      const text = String(nativeCell(column.value(rows[i]!), column.type) ?? '');
      if (text.length > longest) longest = text.length;
    }

    // A wrapping column is capped tighter: it has the row height to grow into,
    // and a 60-wide column of prose pushes everything else off the screen.
    const cap = wraps(column) ? 42 : 60;
    sheetColumn.width = Math.min(Math.max(longest + 2, column.width ?? 10), cap);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** "22 Sep 2026, 14:05" — readable, and unambiguous about the day. */
function formatStamp(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  });
}

/** Excel rejects sheet names over 31 chars or containing : \ / ? * [ ] */
function sheetName(title: string): string {
  return (
    title
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Report'
  );
}
