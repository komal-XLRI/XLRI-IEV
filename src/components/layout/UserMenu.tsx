'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ROLE_LABELS, type Role } from '@/lib/constants/roles';

/** Initials for the avatar. Two at most, so the chip stays a fixed size. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Identity and sign-out, behind one control.
 *
 * The name and role are visible on wide screens and collapse into the avatar
 * below `sm`, which keeps the header usable on a tablet without hiding who is
 * signed in — the thing an administrator most needs to confirm before acting on
 * someone else's record.
 */
export function UserMenu({
  userName,
  role,
  profileHref,
}: {
  userName: string;
  role: Role;
  profileHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function signOut() {
    setOpen(false);
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative" data-print="hide">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${userName}, ${ROLE_LABELS[role]}`}
        className={cn(
          'hover:bg-surface-hover rounded-control flex items-center gap-2 py-1 pr-1.5 pl-1 transition-colors sm:pr-2',
          open && 'bg-surface-hover',
        )}
      >
        <span
          aria-hidden="true"
          className="bg-primary text-primary-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        >
          {initials(userName)}
        </span>

        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-[13px] font-medium">{userName}</span>
          <span className="text-muted-foreground block text-[11px]">{ROLE_LABELS[role]}</span>
        </span>

        <ChevronDown
          className={cn(
            'text-muted-foreground hidden size-3.5 shrink-0 transition-transform sm:block',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="surface-overlay rounded-control absolute right-0 z-40 mt-1.5 w-56 overflow-hidden"
        >
          <div className="border-b px-3 py-2.5">
            <p className="truncate text-[13px] font-semibold">{userName}</p>
            <p className="type-caption">{ROLE_LABELS[role]}</p>
          </div>

          {profileHref ? (
            <Link
              href={profileHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="hover:bg-surface-hover flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors"
            >
              <UserCircle className="text-muted-foreground size-4" aria-hidden="true" />
              Profile &amp; settings
            </Link>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={pending}
            className="hover:bg-surface-hover text-danger-soft-foreground disabled:text-muted-foreground flex w-full items-center gap-2.5 border-t px-3 py-2 text-left text-[13px] transition-colors"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
