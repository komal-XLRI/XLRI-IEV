import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCsvRows, parseGrid, sniffDelimiter } from '@/lib/import/parseCsv';
import { readImportUpload } from '@/lib/import/readUpload';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('delimiter sniffing', () => {
  it('defaults to commas', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('detects a block copied out of a spreadsheet', () => {
    // Copying a range out of Excel puts tabs on the clipboard, and an
    // administrator pasting that has done nothing wrong.
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('detects the semicolon dialect Excel writes in some locales', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
  });

  it('reads only the header line, so a quoted comma cannot outvote tabs', () => {
    const input = 'name\taddress\nAsha\t"12, Park Street, Kolkata"';
    expect(sniffDelimiter(input)).toBe('\t');
  });

  it('keeps commas when a line has neither', () => {
    expect(sniffDelimiter('single')).toBe(',');
  });
});

describe('tab-separated input', () => {
  it('splits on tabs when told to', () => {
    expect(parseCsvRows('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('still honours quoting', () => {
    expect(parseCsvRows('name\tnote\n"Iyer, Meera"\tok', '\t')).toEqual([
      ['name', 'note'],
      ['Iyer, Meera', 'ok'],
    ]);
  });
});

describe('parseGrid', () => {
  const expected = ['rollNumber', 'ventureName'];

  it('maps a grid that was never text', () => {
    const grid = [
      ['Roll Number', 'Venture Name'],
      ['IEV101', 'Kirana Connect'],
    ];

    expect(parseGrid(grid, expected).rows).toEqual([
      { rollNumber: 'IEV101', ventureName: 'Kirana Connect' },
    ]);
  });

  it('matches headers however they are written', () => {
    const grid = [
      ['roll_number', 'VENTURE NAME'],
      ['IEV101', 'Kirana Connect'],
    ];

    expect(parseGrid(grid, expected).rows[0]!.rollNumber).toBe('IEV101');
  });

  it('skips blank rows and keeps line numbers honest', () => {
    const grid = [['Roll Number'], [''], ['IEV102']];
    const parsed = parseGrid(grid, expected);

    expect(parsed.rows).toHaveLength(1);
    // Line 3 of the file, not row 1 of the results — an error has to point at
    // something the person can find in their spreadsheet.
    expect(parsed.lineNumbers).toEqual([3]);
  });

  it('leaves a missing column empty rather than shifting the row', () => {
    const grid = [['Venture Name'], ['Kirana Connect']];

    expect(parseGrid(grid, expected).rows[0]).toEqual({
      rollNumber: '',
      ventureName: 'Kirana Connect',
    });
  });
});

describe('matching a header to a column', () => {
  // The template heads these columns with words that are not their field
  // names. Matching only the field name read them as absent, so a file this
  // system generated came back with three columns silently dropped.
  const expected = [
    { field: 'ventureName', label: 'Venture Name' },
    { field: 'fundingStatus', label: 'Funding' },
    { field: 'problemStatement', label: 'Problem' },
    { field: 'ventureTitle', label: 'Tagline' },
  ];

  it('reads a column headed by its label rather than its field name', () => {
    const grid = [
      ['Venture Name', 'Funding', 'Problem', 'Tagline'],
      ['Kirana Connect', 'Bootstrapped', 'Stores lack reach', 'Stores, online'],
    ];

    expect(parseGrid(grid, expected).rows[0]).toEqual({
      ventureName: 'Kirana Connect',
      fundingStatus: 'Bootstrapped',
      problemStatement: 'Stores lack reach',
      ventureTitle: 'Stores, online',
    });
  });

  it('still reads a column headed by its field name', () => {
    const grid = [
      ['ventureName', 'fundingStatus'],
      ['Kirana Connect', 'Series A'],
    ];

    const row = parseGrid(grid, expected).rows[0]!;
    expect(row.ventureName).toBe('Kirana Connect');
    expect(row.fundingStatus).toBe('Series A');
  });

  it('tolerates the asterisk the Excel template puts on required columns', () => {
    const grid = [
      ['Venture Name *', 'Funding'],
      ['Kirana Connect', 'Bootstrapped'],
    ];

    const row = parseGrid(grid, expected).rows[0]!;
    expect(row.ventureName).toBe('Kirana Connect');
    expect(row.fundingStatus).toBe('Bootstrapped');
  });

  it('accepts a plain list of field names, as callers without labels pass', () => {
    const grid = [['Roll Number'], ['IEV101']];

    expect(parseGrid(grid, ['rollNumber']).rows[0]).toEqual({ rollNumber: 'IEV101' });
  });
});

describe('reading an upload', () => {
  async function workbook(rows: unknown[][]): Promise<Uint8Array> {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Sheet1');
    rows.forEach((row) => sheet.addRow(row));
    return new Uint8Array(await book.xlsx.writeBuffer());
  }

  it('reads a real .xlsx', async () => {
    const file = await workbook([
      ['Roll Number', 'Venture Name'],
      ['IEV101', 'Kirana Connect'],
    ]);

    const { grid, format } = await readImportUpload(file);

    expect(format).toBe('xlsx');
    expect(grid[0]).toEqual(['Roll Number', 'Venture Name']);
    expect(grid[1]).toEqual(['IEV101', 'Kirana Connect']);
  });

  it('renders a date cell as an unambiguous ISO date', async () => {
    // A sheet showing "01/07/26" means different days on different continents;
    // the validators downstream parse dates, not locales.
    const file = await workbook([['Start Date'], [new Date(Date.UTC(2026, 6, 1))]]);

    const { grid } = await readImportUpload(file);
    expect(grid[1]![0]).toBe('2026-07-01');
  });

  it('keeps a blank cell in place instead of shifting the row left', async () => {
    const file = await workbook([
      ['A', 'B', 'C'],
      ['one', null, 'three'],
    ]);

    const { grid } = await readImportUpload(file);
    expect(grid[1]).toEqual(['one', '', 'three']);
  });

  it('reads a CSV upload', async () => {
    const { grid, format } = await readImportUpload(
      bytes('Roll Number,Venture Name\r\nIEV101,Kirana Connect\r\n'),
    );

    expect(format).toBe('csv');
    expect(grid[1]).toEqual(['IEV101', 'Kirana Connect']);
  });

  it('reads a tab-separated upload', async () => {
    const { grid } = await readImportUpload(
      bytes('Roll Number\tVenture Name\nIEV101\tKirana Connect'),
    );

    expect(grid[1]).toEqual(['IEV101', 'Kirana Connect']);
  });

  it('detects a workbook by its content, not its name', async () => {
    // A spreadsheet renamed .csv is still a zip, and decoding it as text would
    // produce a wall of nonsense rather than an explanation.
    const file = await workbook([['A'], ['one']]);

    const { format } = await readImportUpload(file);
    expect(format).toBe('xlsx');
  });

  it('explains an old .xls rather than failing on a stray byte', async () => {
    const biff = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

    await expect(readImportUpload(biff)).rejects.toThrow(/save as \.xlsx/i);
  });

  it('still recognises an .xls whose bytes happen to contain a comma', async () => {
    // The whole file is binary, so somewhere in it there is almost certainly a
    // 0x2c. Deciding the format by "does it contain a comma" sent real .xls
    // files down the CSV path and answered with a screen of mojibake; the
    // OLE2 signature is what actually settles it.
    const biff = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x2c, 0x09, 0x00, 0x2c,
    ]);

    await expect(readImportUpload(biff)).rejects.toThrow(/save as \.xlsx/i);
  });

  it('does not mistake a CSV that opens with a "D" for a legacy workbook', async () => {
    // The signature has to match all eight bytes, not just the first.
    const { grid, format } = await readImportUpload(bytes('Department,Name\nOps,Asha'));

    expect(format).toBe('csv');
    expect(grid[1]).toEqual(['Ops', 'Asha']);
  });

  it('strips a UTF-8 BOM from a CSV upload', async () => {
    const { grid } = await readImportUpload(bytes('﻿Roll Number\nIEV101'));
    expect(grid[0]).toEqual(['Roll Number']);
  });
});
