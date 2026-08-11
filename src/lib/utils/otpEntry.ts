/**
 * The editing rules behind a one-box-per-digit code input.
 *
 * Kept apart from the component because this is where the behaviour actually
 * lives — where the caret lands after a paste, what Backspace means in a box
 * that is already empty — and none of it needs a DOM to be true. The component
 * is left with rendering and wiring.
 *
 * Every function preserves one invariant: the value is a *dense prefix*. "12"
 * means boxes one and two, and there is no way to strand a digit in box five
 * with holes behind it. That is what makes the string safe to send as the code
 * and makes "the next box" a fact rather than a search.
 */

export interface OtpEdit {
  /** The code after the edit. Never longer than `length`, never has holes. */
  value: string;
  /** The box that should hold the caret afterwards. */
  focus: number;
}

const NON_DIGITS = /\D/g;
/**
 * The same character class without `g`. `RegExp.test` on a global regex
 * advances `lastIndex` and so alternates between true and false on repeated
 * calls with the same string — a bug that only shows up on the second call.
 */
const HAS_NON_DIGIT = /\D/;

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * Writes digits into the code starting at `from`, dropping anything that is
 * not a digit and anything past the end.
 *
 * Everything after the insertion point is replaced rather than shifted along:
 * typing into box three means "box three is now this", not "insert here and
 * push the rest right".
 */
export function insertDigits(value: string, from: number, raw: string, length: number): OtpEdit {
  const digits = raw.replace(NON_DIGITS, '');
  const start = clamp(from, length);

  if (digits.length === 0) return { value, focus: start };

  const next = (value.slice(0, start) + digits).slice(0, length);
  return { value: next, focus: clamp(next.length, length) };
}

/**
 * Backspace.
 *
 * In a box holding a digit it clears that box. In one already empty it steps
 * back and clears the box behind — which is what makes holding Backspace walk
 * the code away one digit at a time, rather than stalling on the first gap.
 */
export function deleteBackward(value: string, index: number, length: number): OtpEdit {
  const at = clamp(index, length);

  if (value[at]) return { value: value.slice(0, at), focus: at };
  if (at === 0) return { value, focus: 0 };

  return { value: value.slice(0, at - 1), focus: at - 1 };
}

/**
 * A paste, wherever it was aimed.
 *
 * A paste of the full code is the whole code however the user aimed it, so it
 * starts from the beginning; people paste into whichever box the pointer
 * happened to be over. A shorter paste is treated as filling in from where
 * they are.
 */
export function pasteDigits(value: string, index: number, pasted: string, length: number): OtpEdit {
  const digits = pasted.replace(NON_DIGITS, '');
  const from = digits.length >= length ? 0 : index;

  return insertDigits(value, from, digits, length);
}

/**
 * Where focus should actually go when a box is clicked.
 *
 * Clicking into an empty box past the end of the code would put the caret
 * somewhere a digit cannot legally land. Redirecting to the first empty box
 * both keeps the value dense and matches what the click meant.
 */
export function focusTargetFor(value: string, index: number, length: number): number {
  return index > value.length ? clamp(value.length, length) : clamp(index, length);
}

/** Whether the code is complete and safe to submit. */
export function isOtpComplete(value: string, length: number): boolean {
  return value.length === length && !HAS_NON_DIGIT.test(value);
}
