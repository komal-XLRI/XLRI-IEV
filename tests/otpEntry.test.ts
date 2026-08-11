/**
 * The editing rules behind the six-box code input.
 *
 * Every case here is one somebody hits on a real login screen: pasting a code
 * out of an email, correcting a mistyped digit, holding Backspace, clicking
 * into the middle of an empty grid. The invariant they all check is that the
 * value stays a dense prefix — because that string is what gets sent to
 * `verify-otp`, and a hole in it would be a code the user never typed.
 */
import { describe, expect, it } from 'vitest';
import {
  deleteBackward,
  focusTargetFor,
  insertDigits,
  isOtpComplete,
  pasteDigits,
} from '@/lib/utils/otpEntry';

const LENGTH = 6;

describe('typing', () => {
  it('puts a digit in the box it was typed into and moves on', () => {
    expect(insertDigits('', 0, '4', LENGTH)).toEqual({ value: '4', focus: 1 });
    expect(insertDigits('4', 1, '8', LENGTH)).toEqual({ value: '48', focus: 2 });
  });

  it('holds the caret on the last box once the code is full', () => {
    // There is nowhere further to go, and wrapping to the start would undo
    // the digit the user just typed on their next keystroke.
    expect(insertDigits('12345', 5, '6', LENGTH)).toEqual({ value: '123456', focus: 5 });
  });

  it('overwrites the box being typed into rather than shifting the rest along', () => {
    expect(insertDigits('123456', 2, '9', LENGTH)).toEqual({ value: '129', focus: 3 });
  });

  it('ignores letters, spaces and symbols', () => {
    expect(insertDigits('12', 2, 'a', LENGTH)).toEqual({ value: '12', focus: 2 });
    expect(insertDigits('12', 2, ' ', LENGTH)).toEqual({ value: '12', focus: 2 });
    expect(insertDigits('12', 2, '-', LENGTH)).toEqual({ value: '12', focus: 2 });
    expect(insertDigits('12', 2, 'e', LENGTH)).toEqual({ value: '12', focus: 2 });
  });

  it('keeps the digits out of a mixed string', () => {
    expect(insertDigits('', 0, 'a1b2', LENGTH)).toEqual({ value: '12', focus: 2 });
  });

  it('never grows past the last box', () => {
    expect(insertDigits('', 0, '1234567890', LENGTH).value).toBe('123456');
  });
});

describe('backspace', () => {
  it('clears the digit in the current box and stays put', () => {
    expect(deleteBackward('123', 2, LENGTH)).toEqual({ value: '12', focus: 2 });
  });

  it('steps back and clears when the current box is already empty', () => {
    expect(deleteBackward('12', 2, LENGTH)).toEqual({ value: '1', focus: 1 });
  });

  it('does nothing at the very start', () => {
    expect(deleteBackward('', 0, LENGTH)).toEqual({ value: '', focus: 0 });
  });

  it('walks the whole code away one digit at a time', () => {
    // Holding Backspace must not stall on the first empty box.
    let state = { value: '123456', focus: 5 };
    for (let i = 0; i < LENGTH; i += 1) {
      state = deleteBackward(state.value, state.focus, LENGTH);
    }
    expect(state.value).toBe('');
    expect(state.focus).toBe(0);
  });
});

describe('pasting', () => {
  it('spreads a full code across every box, whichever box it was aimed at', () => {
    expect(pasteDigits('', 0, '482913', LENGTH)).toEqual({ value: '482913', focus: 5 });
    // Someone pasting into box four still means "this is the code".
    expect(pasteDigits('', 3, '482913', LENGTH)).toEqual({ value: '482913', focus: 5 });
  });

  it('strips the formatting people paste out of an email', () => {
    expect(pasteDigits('', 0, '482 913', LENGTH).value).toBe('482913');
    expect(pasteDigits('', 0, '482-913', LENGTH).value).toBe('482913');
    expect(pasteDigits('', 0, ' 482913 ', LENGTH).value).toBe('482913');
  });

  it('fills in from the current box for a partial paste', () => {
    expect(pasteDigits('12', 2, '34', LENGTH)).toEqual({ value: '1234', focus: 4 });
  });

  it('takes the code out of a longer string', () => {
    expect(pasteDigits('', 0, 'Your code is 482913, valid 10 minutes', LENGTH).value).toBe(
      '482913',
    );
  });

  it('ignores a paste with no digits in it', () => {
    expect(pasteDigits('12', 2, 'hello', LENGTH)).toEqual({ value: '12', focus: 2 });
  });
});

describe('where the caret is allowed to land', () => {
  it('redirects a click past the end of the code to the next empty box', () => {
    expect(focusTargetFor('12', 5, LENGTH)).toBe(2);
  });

  it('leaves a click on a filled box alone, so a digit can be corrected', () => {
    expect(focusTargetFor('123456', 3, LENGTH)).toBe(3);
    expect(focusTargetFor('12', 0, LENGTH)).toBe(0);
  });

  it('allows the first empty box itself', () => {
    expect(focusTargetFor('12', 2, LENGTH)).toBe(2);
  });

  it('stays inside the row', () => {
    expect(focusTargetFor('123456', -1, LENGTH)).toBe(0);
    expect(focusTargetFor('123456', 99, LENGTH)).toBe(5);
  });
});

describe('the value handed to the API', () => {
  it('is only complete at full length and all digits', () => {
    expect(isOtpComplete('482913', LENGTH)).toBe(true);
    expect(isOtpComplete('48291', LENGTH)).toBe(false);
    expect(isOtpComplete('4829133', LENGTH)).toBe(false);
  });

  it('gives the same answer when asked twice', () => {
    // A global regex would advance its lastIndex between calls and alternate.
    const code = '482913';
    expect(isOtpComplete(code, LENGTH)).toBe(true);
    expect(isOtpComplete(code, LENGTH)).toBe(true);
    expect(isOtpComplete(code, LENGTH)).toBe(true);
  });

  it('never contains a hole, however the code was assembled', () => {
    const journeys = [
      () => insertDigits('', 0, '1', LENGTH),
      () => pasteDigits('9', 4, '123', LENGTH),
      () => deleteBackward('1234', 1, LENGTH),
      () => insertDigits('12', 5, '7', LENGTH),
      () => pasteDigits('', 3, '482913', LENGTH),
    ];

    for (const journey of journeys) {
      const { value, focus } = journey();
      expect(value).not.toMatch(/\s/);
      expect(value.length).toBeLessThanOrEqual(LENGTH);
      // Dense: the caret is never left beyond the first empty box.
      expect(focus).toBeLessThanOrEqual(Math.min(value.length, LENGTH - 1));
    }
  });
});
