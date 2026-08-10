import 'server-only';
import ExcelJS from 'exceljs';
import { nativeCell } from './format';
import type { AnyExportDataset } from './types';

const HEADER_FILL = 'FF1E293B'; // slate-800
const TITLE_COLOUR = 'FF0F172A'; // slate-900
const MUTED_COLOUR = 'FF64748B'; // slate-500

/**
 * Real .xlsx, not a CSV with the wrong extension: numbers stay numeric, dates
 * stay dates, percentages carry a percent format, the header row freezes, and
 * an autofilter is applied so the recipient can slice the data further.
 */
export async function toXlsx(dataset: AnyExportDataset): Promise<Buffer> {
  const { meta, columns, rows, summary } = dataset;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IEV Activity Tracker';
  workbook.created = meta.generatedAt;

  const sheet = workbook.addWorksheet(sheetName(meta.title), {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // ---- Preamble ----------------------------------------------------------
  const titleRow = sheet.addRow([meta.title]);
  titleRow.font = { bold: true, size: 14, color: { argb: TITLE_COLOUR } };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, Math.max(columns.length, 2));

  if (meta.subtitle) {
    const subtitleRow = sheet.addRow([meta.subtitle]);
    subtitleRow.font = { size: 10, color: { argb: MUTED_COLOUR } };
    sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, Math.max(columns.length, 2));
  }

  for (const filter of meta.filters) {
    const row = sheet.addRow([filter.label, filter.value]);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: MUTED_COLOUR } };
    row.getCell(2).font = { size: 10, color: { argb: MUTED_COLOUR } };
  }

  if (meta.sort) {
    const row = sheet.addRow(['Sorted by', meta.sort]);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: MUTED_COLOUR } };
    row.getCell(2).font = { size: 10, color: { argb: MUTED_COLOUR } };
  }

  const provenance = sheet.addRow([
    'Generated',
    `${meta.generatedAt.toISOString()} by ${meta.generatedBy}`,
  ]);
  provenance.getCell(1).font = { bold: true, size: 10, color: { argb: MUTED_COLOUR } };
  provenance.getCell(2).font = { size: 10, color: { argb: MUTED_COLOUR } };

  sheet.addRow([]);

  // ---- Header row --------------------------------------------------------
  const headerRow = sheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });

  const headerRowNumber = headerRow.number;

  // ---- Data --------------------------------------------------------------
  for (const row of rows) {
    const values = columns.map((column) => nativeCell(column.value(row), column.type));
    const added = sheet.addRow(values);

    added.eachCell((cell, index) => {
      const column = columns[index - 1];
      if (!column) return;

      if (column.type === 'percent') cell.numFmt = '0%';
      else if (column.type === 'date') cell.numFmt = 'dd mmm yyyy';
      else if (column.type === 'datetime') cell.numFmt = 'dd mmm yyyy hh:mm';

      if (column.align) cell.alignment = { horizontal: column.align };
    });
  }

  // Freeze the header and let the recipient filter further.
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + rows.length, column: columns.length },
    };
  }

  // ---- Summary -----------------------------------------------------------
  if (summary && summary.length > 0) {
    sheet.addRow([]);
    for (const entry of summary) {
      const row = sheet.addRow([entry.label, entry.value]);
      row.getCell(1).font = { bold: true };
    }
  }

  // ---- Column widths -----------------------------------------------------
  columns.forEach((column, index) => {
    const sheetColumn = sheet.getColumn(index + 1);
    const headerLength = column.header.length;

    // Sample the data so columns fit without walking every row of a big export.
    let longest = headerLength;
    const sampleSize = Math.min(rows.length, 200);
    for (let i = 0; i < sampleSize; i += 1) {
      const text = String(nativeCell(column.value(rows[i]!), column.type) ?? '');
      if (text.length > longest) longest = text.length;
    }

    sheetColumn.width = Math.min(Math.max(longest + 2, column.width ?? 10), 60);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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
