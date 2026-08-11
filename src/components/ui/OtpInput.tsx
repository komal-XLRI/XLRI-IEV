'use client';

import { useEffect, useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  deleteBackward,
  focusTargetFor,
  insertDigits,
  pasteDigits,
  type OtpEdit,
} from '@/lib/utils/otpEntry';

/**
 * A one-time code entered across one box per digit.
 *
 * The editing rules live in `@/lib/utils/otpEntry` — what Backspace means in an
 * empty box, where a paste lands, how the value stays free of holes. This is
 * the wiring: it turns events into those calls and puts the caret where they
 * say it should go.
 *
 * Boxes flex rather than take a fixed width, so six of them fit a 320px screen
 * without the row wrapping or the card scrolling sideways.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  id,
  disabled = false,
  invalid = false,
  describedBy,
  autoFocus = false,
  label = 'One-time code',
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  /** Names the group for a screen reader; each box is numbered within it. */
  label?: string;
}) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  /**
   * The code as of the last keystroke, which is not always what the `value`
   * prop says yet.
   *
   * Someone typing six digits quickly can land the next keystroke before React
   * has re-rendered with the previous one, and an edit computed from a stale
   * value silently drops digits — "123" arriving as "23". Reading from a ref
   * that is written synchronously makes each edit build on the one before it
   * rather than on whatever the last render happened to see.
   */
  const current = useRef(value);
  const emitted = useRef(value);

  useEffect(() => {
    // The value changed to something we did not send up — the parent clearing
    // the code when a new one is requested. Adopt it.
    if (value !== emitted.current) current.current = value;
  }, [value]);

  // Deliberately not keyed on the value: the caret belongs to the first box
  // when the screen opens, and to wherever the last edit put it after that.
  useEffect(() => {
    if (!autoFocus || disabled) return;
    boxes.current[0]?.focus();
  }, [autoFocus, disabled]);

  function focusBox(index: number) {
    const box = boxes.current[index];
    box?.focus();
    box?.select();
  }

  /** Applies an edit and moves the caret to the box it nominated. */
  function apply(edit: OtpEdit) {
    current.current = edit.value;
    emitted.current = edit.value;
    onChange(edit.value);
    focusBox(edit.focus);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    const code = current.current;

    switch (event.key) {
      case 'Backspace':
        event.preventDefault();
        apply(deleteBackward(code, index, length));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusBox(focusTargetFor(code, index - 1, length));
        break;
      case 'ArrowRight':
        event.preventDefault();
        focusBox(focusTargetFor(code, index + 1, length));
        break;
      case 'Home':
        event.preventDefault();
        focusBox(0);
        break;
      case 'End':
        event.preventDefault();
        focusBox(focusTargetFor(code, length - 1, length));
        break;
      default:
        break;
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (pasted.replace(/\D/g, '').length === 0) return;

    event.preventDefault();
    apply(pasteDigits(current.current, index, pasted, length));
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex items-center gap-1.5 sm:gap-2"
    >
      {Array.from({ length }, (_, index) => {
        const filled = Boolean(value[index]);

        return (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            id={index === 0 ? baseId : `${baseId}-${index + 1}`}
            // Not type="number": it brings spinners, accepts "e" and "-", and
            // reports an empty value for anything it considers malformed, which
            // makes a per-digit box impossible to reason about.
            type="text"
            inputMode="numeric"
            // The pattern is what actually opens the numeric keypad on iOS.
            pattern="[0-9]*"
            maxLength={1}
            // Only the first box: a browser filling a one-time code puts the
            // whole value in one field, and `insertDigits` spreads it out.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={value[index] ?? ''}
            onChange={(event) =>
              apply(insertDigits(current.current, index, event.target.value, length))
            }
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => {
              const target = focusTargetFor(current.current, index, length);
              if (target !== index) {
                focusBox(target);
                return;
              }
              // Selecting means the next keystroke replaces the digit rather
              // than being refused by maxLength, so a box can be corrected
              // without clearing it first.
              event.target.select();
            }}
            className={cn(
              'h-12 min-w-0 flex-1 rounded-lg border text-center text-lg font-semibold tabular-nums shadow-sm transition-colors',
              'bg-input text-foreground',
              invalid
                ? 'border-danger-border hover:border-danger'
                : cn(
                    'border-input-border hover:border-border-strong',
                    filled && 'border-border-strong',
                  ),
              'disabled:bg-muted disabled:text-muted-foreground disabled:hover:border-input-border disabled:cursor-not-allowed',
            )}
          />
        );
      })}
    </div>
  );
}
