import 'server-only';
import ExcelJS from 'exceljs';
import { ValidationError } from '@/lib/errors';
import { parseCsvRows, sniffDelimiter } from './parseCsv';

/**
 * Turns an uploaded file into a grid of strings.
 *
 * Administrators do not keep their data as CSV; they keep it in Excel and
 * export a CSV because a form asked them to. Every step of that conversion is
 * somewhere a file gets mangled — a roll number turned into 1.02e+11, a date
 * reformatted, a comma inside an address splitting a column — so accepting the
 * workbook directly removes the step rather than documenting it.
 *
 * Parsing stays on the server. The browser could read a spreadsheet, but then
 * two different parsers would decide what a row is, and the preview would stop
 * being a promise about what the import will do.
 */

/** Zip magic bytes. Every .xlsx is a zip; an .xls (BIFF) is not. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * OLE2 compound-file magic — the container a pre-2007 .xls sits in.
 *
 * Checked by content rather than inferred from the absence of separators: a
 * BIFF file is binary, so it very likely contains a stray comma byte
 * somewhere, and a guess based on "does it contain a comma" would send a real
 * .xls down the CSV path and answer with a screenful of mojibake instead of
 * saying what to do about it.
 */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function looksLikeLegacyExcel(bytes: Uint8Array): boolean {
  return OLE2_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * A cell as the sheet's own text.
 *
 * Dates are rendered ISO rather than by the sheet's display format: a column
 * showing "01/07/26" is ambiguous in a way `2026-07-01` is not, and the
 * validators downstream parse dates, not locales.
 */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'object') {
    // Formulas carry their last computed result; a hyperlink carries its text.
    if ('result' in value && value.result !== undefined) return cellToText(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('error' in value) return '';
    return '';
  }

  return String(value);
}

async function readWorkbook(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError(
      'That spreadsheet could not be read. Re-save it as .xlsx or export it as CSV.',
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ValidationError('That workbook has no sheets in it');

  const grid: string[][] = [];

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];

    // `eachCell` skips empty cells, which would shift every later column left.
    // Reading by index keeps a blank cell blank.
    const width = row.cellCount;
    for (let column = 1; column <= width; column += 1) {
      cells.push(cellToText(row.getCell(column).value).trim());
    }

    grid.push(cells);
  });

  return grid;
}

/**
 * Reads whatever was uploaded into rows.
 *
 * Detection is by content, and the file name is deliberately not consulted:
 * a workbook renamed .csv is still a zip, and an export named .xls is very
 * often really a CSV. Trusting the extension gets both of those wrong.
 */
export async function readImportUpload(
  bytes: Uint8Array,
): Promise<{ grid: string[][]; format: 'xlsx' | 'csv' }> {
  if (looksLikeZip(bytes)) {
    return { grid: await readWorkbook(bytes), format: 'xlsx' };
  }

  if (looksLikeLegacyExcel(bytes)) {
    // A real .xls (BIFF) is a different, much older format that ExcelJS does
    // not read. Saying so beats a parse error about an unexpected character.
    throw new ValidationError(
      'That looks like an old .xls file. Open it in Excel and save as .xlsx, or export it as CSV.',
    );
  }

  const text = new TextDecoder('utf-8').decode(bytes);
  return { grid: parseCsvRows(text, sniffDelimiter(text)), format: 'csv' };
}
