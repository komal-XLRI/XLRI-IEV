'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

/**
 * A menu that opens against a button without being trapped by it.
 *
 * A `Card` clips its own contents so a table can meet its rounded corner
 * cleanly. That is right for everything a card contains — and fatal for a
 * menu, which is the one thing meant to hang outside it: positioned absolutely
 * inside a card header, the menu was sliced off mid-item and the items below
 * the cut were simply unreachable.
 *
 * So it renders into `document.body`, outside every ancestor that could clip
 * it, and is positioned against where the button sits on the screen. The cost
 * is that the two are no longer attached: the position is measured when the
 * menu opens, and the menu closes on scroll or resize rather than drifting
 * away from the button it belongs to.
 *
 * It opens upwards when there is more room above, which is what makes a menu
 * on a card near the bottom of a long page usable at all.
 */

/** Clearance kept from every edge of the viewport. */
const MARGIN = 8;

/** Below this, a menu is cramped enough to be worth flipping for. */
const COMFORTABLE = 220;

interface Position {
  left: number;
  /** One of the two is set; the other anchors nothing. */
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

export function AnchoredMenu({
  open,
  anchorRef,
  onClose,
  align = 'right',
  width = 256,
  className,
  children,
  label,
}: {
  open: boolean;
  /** The button the menu belongs to. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: 'left' | 'right';
  /** Preferred width in pixels, narrowed on a phone to keep both margins. */
  width?: number;
  className?: string;
  children: ReactNode;
  /** Names the menu for screen readers, e.g. "Import options". */
  label?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  // Measured before paint: a menu that renders at the origin and then jumps to
  // its button is a flicker on every single open.
  useLayoutEffect(() => {
    // Nothing to measure while closed, and no need to clear the last
    // measurement: this runs before paint, so a reopened menu is repositioned
    // before anybody could see it in its old place.
    if (!open) return;

    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    const menuWidth = Math.min(width, viewWidth - MARGIN * 2);

    const below = viewHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;
    // Only flip for a real gain: flipping over a few pixels reads as the menu
    // deciding things for itself.
    const flip = below < COMFORTABLE && above > below;

    const preferred = align === 'right' ? rect.right - menuWidth : rect.left;
    const left = Math.max(MARGIN, Math.min(preferred, viewWidth - menuWidth - MARGIN));

    setPosition({
      left,
      width: menuWidth,
      ...(flip
        ? { bottom: viewHeight - rect.top + 4, maxHeight: above }
        : { top: rect.bottom + 4, maxHeight: below }),
    });
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      // The button closes the menu itself, by toggling. Treating its own click
      // as an outside click would close and reopen in the same gesture.
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    // Pinned to the viewport, the menu cannot follow its button, so it closes
    // rather than hovering over unrelated content. Captured, because the
    // scrolling pane may be any ancestor between the button and the page.
    const onReflow = () => onClose();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open, onClose, anchorRef]);

  if (!open || position === null) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        width: position.width,
        // Never shorter than a couple of items: on a cramped screen a scroll
        // is better than a menu too short to show anything.
        maxHeight: Math.max(160, position.maxHeight),
      }}
      className={cn(
        'surface-overlay fixed z-50 overflow-y-auto overscroll-contain rounded-lg',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
