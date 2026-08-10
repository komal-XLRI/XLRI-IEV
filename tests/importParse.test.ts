import { describe, expect, it } from 'vitest';
import {
  hasRecognisableHeader,
  normaliseHeader,
  parseCsv,
  parseCsvRows,
} from '@/lib/import/parseCsv';

describe('CSV row parsing', () => {
  it('splits simple rows', () => {
    expect(parseCsvRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsvRows('name,note\n"Iyer, Meera",ok')).toEqual([
      ['name', 'note'],
      ['Iyer, Meera', 'ok'],
    ]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsvRows('a\n"She said ""no"""')).toEqual([['a'], ['She said "no"']]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsvRows('a\n"line one\nline two"')).toEqual([['a'], ['line one\nline two']]);
  });

  it('handles CRLF endings', () => {
    expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsvRows('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('does not emit a trailing empty record', () => {
    expect(parseCsvRows('a,b\n1,2\n')).toHaveLength(2);
  });
});

describe('header normalisation', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(normaliseHeader('Roll Number')).toBe('rollnumber');
    expect(normaliseHeader('roll_number')).toBe('rollnumber');
    expect(normaliseHeader('rollNumber')).toBe('rollnumber');
    expect(normaliseHeader('  ROLL-NUMBER ')).toBe('rollnumber');
  });
});

describe('record parsing', () => {
  const fields = ['name', 'email', 'rollNumber', 'batch'];

  it('maps columns by fuzzy header match', () => {
    const csv = 'Name,Email,Roll Number,Batch\nAsha,asha@x.com,IEV001,2026';
    const { rows } = parseCsv(csv, fields);

    expect(rows).toEqual([
      { name: 'Asha', email: 'asha@x.com', rollNumber: 'IEV001', batch: '2026' },
    ]);
  });

  it('tolerates reordered columns', () => {
    const csv = 'Batch,Email,Name,Roll Number\n2026,asha@x.com,Asha,IEV001';
    expect(parseCsv(csv, fields).rows[0]).toEqual({
      name: 'Asha',
      email: 'asha@x.com',
      rollNumber: 'IEV001',
      batch: '2026',
    });
  });

  it('ignores unknown extra columns', () => {
    const csv = 'Name,Email,Roll Number,Batch,Nickname\nAsha,asha@x.com,IEV001,2026,Ash';
    expect(Object.keys(parseCsv(csv, fields).rows[0]!)).toEqual(fields);
  });

  it('yields empty strings for missing columns', () => {
    const csv = 'Name,Email\nAsha,asha@x.com';
    expect(parseCsv(csv, fields).rows[0]).toEqual({
      name: 'Asha',
      email: 'asha@x.com',
      rollNumber: '',
      batch: '',
    });
  });

  it('skips fully blank rows', () => {
    const csv =
      'Name,Email,Roll Number,Batch\nAsha,a@x.com,IEV001,2026\n,,,\nRavi,r@x.com,IEV002,2026';
    expect(parseCsv(csv, fields).rows).toHaveLength(2);
  });

  it('reports 1-based line numbers for error messages', () => {
    const csv = 'Name,Email,Roll Number,Batch\nAsha,a@x.com,IEV001,2026\nRavi,r@x.com,IEV002,2026';
    expect(parseCsv(csv, fields).lineNumbers).toEqual([2, 3]);
  });

  it('round-trips a file produced by our own exporter', () => {
    // The exporter tab-guards formula-looking cells; the importer strips that.
    const csv = 'Name,Email,Roll Number,Batch\n\t=Asha,a@x.com,IEV001,2026';
    expect(parseCsv(csv, fields).rows[0]!.name).toBe('=Asha');
  });

  it('returns nothing for an empty document', () => {
    expect(parseCsv('', fields).rows).toEqual([]);
  });
});

describe('header detection', () => {
  it('recognises a header row', () => {
    expect(hasRecognisableHeader('Name,Email\nAsha,a@x.com', ['name', 'email'])).toBe(true);
  });

  it('rejects a file with no matching header', () => {
    expect(hasRecognisableHeader('foo,bar\n1,2', ['name', 'email'])).toBe(false);
  });
});
