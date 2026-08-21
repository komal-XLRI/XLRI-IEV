'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils/cn';

/**
 * Modal dialog.
 *
 * Built on the native `<dialog>` element so the browser supplies the top layer,
 * the focus trap, the inert backdrop and Escape-to-close — all of which are
 * easy to get subtly wrong by hand, and all of which matter for keyboard and
 * screen-reader users.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // A <dialog> can close by routes React does not control: Escape (which fires
  // `cancel`), a `<form method="dialog">` submit, or a direct `.close()`. If
  // any of those happen while the parent still believes `open` is true, the
  // effect above sees no change and the dialog can never be reopened. Listening
  // for `close` as well keeps the parent's state tied to the element's own.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    const onCloseEvent = () => onClose();

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onCloseEvent);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onCloseEvent);
    };
  }, [onClose]);

  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' }[size];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-print="hide"
      onClick={(event) => {
        // The backdrop is part of the dialog's own box, so a click landing on
        // the element itself (not on the panel inside it) is a backdrop click.
        if (event.target === dialogRef.current) onClose();
      }}
      className={cn(
        'bg-surface text-foreground rounded-card shadow-raised m-auto w-[calc(100%-2rem)] border p-0',
        // Capped and laid out as a column so a long body scrolls inside the
        // panel instead of stretching it past the viewport — which strands the
        // footer mid-screen and scrolls the title out of sight.
        'max-h-[calc(100dvh-3rem)] flex-col overflow-hidden open:flex',
        'backdrop:bg-overlay backdrop:animate-overlay-in open:animate-dialog-in',
        width,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="type-card-title">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="type-secondary mt-1">
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="text-muted-foreground hover:bg-surface-hover hover:text-foreground -mt-1 -mr-1 rounded-md p-1.5 transition-colors"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* `flex-auto`, not `flex-1`: a zero basis would collapse the body to
          nothing in a panel that sizes itself to its content. */}
      {children ? (
        <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
      ) : null}

      {footer ? (
        <div className="surface-sunken flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Confirmation before something irreversible.
 *
 * Deliberately not a `window.confirm`: that cannot say *what* is about to
 * happen in the product's own language, and it blocks the whole tab.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {tone === 'danger' ? (
          <span className="bg-danger-soft text-danger-soft-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full">
            <AlertTriangle className="size-4.5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="type-body min-w-0">{message}</div>
      </div>
    </Modal>
  );
}
