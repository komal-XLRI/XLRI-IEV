'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Library,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  UserCheck,
  UserCheck2,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { XlriLogo } from '@/components/branding/XlriLogo';
import { sidebarCollapsed } from '@/lib/ui/persistentFlag';

/**
 * Icons are referenced by name rather than by component reference, because the
 * nav arrays are declared in Server Component layouts and a function prop
 * cannot cross the RSC boundary. The name is just a string; the mapping to a
 * component happens here, on the client.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  students: Users,
  faculty: GraduationCap,
  mentors: UserCheck,
  ventures: Briefcase,
  ventureActivities: Activity,
  supportActivities: HeartHandshake,
  attendance: UserCheck2,
  academic: BookOpen,
  subjects: Library,
  workshops: Presentation,
  sessions: CalendarDays,
  reviews: ClipboardCheck,
  reports: FileBarChart,
  profile: UserCircle,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Match this href exactly rather than by prefix (used for section roots). */
  exact?: boolean;
  /** Heading this item sits under. Items with no group lead the list. */
  group?: string;
}

function isActive(pathname: string, item: SidebarNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Preserves declaration order for both the groups and the items inside them. */
function groupItems(
  nav: SidebarNavItem[],
): Array<{ heading: string | null; items: SidebarNavItem[] }> {
  const sections: Array<{ heading: string | null; items: SidebarNavItem[] }> = [];

  for (const item of nav) {
    const heading = item.group ?? null;
    const last = sections[sections.length - 1];

    if (last && last.heading === heading) last.items.push(item);
    else sections.push({ heading, items: [item] });
  }

  return sections;
}

function NavList({
  nav,
  collapsed,
  onNavigate,
}: {
  nav: SidebarNavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = groupItems(nav);

  return (
    <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
      {sections.map((section, sectionIndex) => (
        <div
          key={section.heading ?? `lead-${sectionIndex}`}
          className={sectionIndex > 0 ? 'mt-5' : ''}
        >
          {section.heading ? (
            collapsed ? (
              // A rule stands in for the heading when there is no room for the
              // words, so the grouping survives the collapsed rail.
              <div className="border-sidebar-border mx-2 mb-2 border-t" aria-hidden="true" />
            ) : (
              <p className="text-sidebar-section mb-1.5 px-3 text-[11px] font-semibold tracking-[0.085em] uppercase">
                {section.heading}
              </p>
            )
          ) : null}

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isActive(pathname, item);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    // The native tooltip is what a collapsed rail needs: it
                    // survives keyboard focus and needs no extra markup.
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group rounded-control relative flex items-center text-[13.5px] transition-colors',
                      // A comfortable target at both widths — 36px tall, and the
                      // full rail width when collapsed.
                      collapsed ? 'h-9 justify-center' : 'h-9 gap-3 px-3',
                      active
                        ? 'bg-sidebar-active text-sidebar-active-foreground font-semibold'
                        : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                    )}
                  >
                    {/* The marker is absolutely positioned so the label never
                        shifts when an item becomes active. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'bg-sidebar-marker absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {collapsed ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarBrand({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  return (
    <div
      className={cn(
        'border-sidebar-border flex items-center gap-2 border-b',
        collapsed ? 'justify-center px-2 py-3.5' : 'px-4 py-3.5',
      )}
    >
      <Link
        href="/"
        aria-label="IEV Activity Tracker, home"
        className="rounded-control flex min-w-0 flex-1 items-center gap-3"
      >
        {/* The plate is a token: transparent on the light rail, a light field on
            the dark one. The artwork itself is never altered per theme. */}
        <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-(--logo-plate) p-(--logo-plate-pad)">
          <XlriLogo height={collapsed ? 18 : 24} priority />
        </span>

        {collapsed ? null : (
          <span className="min-w-0 leading-tight">
            <span className="text-sidebar-foreground block truncate text-[13px] font-semibold">
              IEV Activity Tracker
            </span>
            <span className="text-sidebar-section block truncate text-[11px]">
              Entrepreneurship &amp; Innovation
            </span>
          </span>
        )}
      </Link>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground rounded-md p-1.5 transition-colors md:hidden"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  profileHref,
  onNavigate,
}: {
  collapsed: boolean;
  profileHref?: string;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn('border-sidebar-border border-t', collapsed ? 'px-2 py-2' : 'px-3 py-2')}>
      {profileHref ? (
        <Link
          href={profileHref}
          onClick={onNavigate}
          title={collapsed ? 'Profile and settings' : undefined}
          className={cn(
            'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground rounded-control flex items-center text-[13.5px] transition-colors',
            collapsed ? 'h-9 justify-center' : 'h-9 gap-3 px-3',
          )}
        >
          <UserCircle className="size-4 shrink-0" aria-hidden="true" />
          {collapsed ? (
            <span className="sr-only">Profile and settings</span>
          ) : (
            <span className="truncate">Profile &amp; settings</span>
          )}
        </Link>
      ) : null}

      {collapsed ? null : (
        <p className="text-sidebar-section px-3 pt-2 pb-1 text-[11px] leading-relaxed">
          XLRI Xavier School of Management
        </p>
      )}
    </div>
  );
}

/** Desktop rail. Hidden below `md`, where the drawer takes over. */
export function Sidebar({ nav, profileHref }: { nav: SidebarNavItem[]; profileHref?: string }) {
  // localStorage is state outside React, so it is read as such rather than
  // copied in by an effect. The boot script has already applied the matching
  // attribute to <html>, so the rail is the right width before this runs.
  const collapsed = useSyncExternalStore(
    sidebarCollapsed.subscribe,
    sidebarCollapsed.getSnapshot,
    sidebarCollapsed.getServerSnapshot,
  );

  return (
    <aside
      data-app-sidebar=""
      className={cn(
        'bg-sidebar border-sidebar-border sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <SidebarBrand collapsed={collapsed} />
      <NavList nav={nav} collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} profileHref={profileHref} />

      <button
        type="button"
        onClick={() => sidebarCollapsed.set(!collapsed)}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-pressed={collapsed}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        className={cn(
          'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground border-sidebar-border flex h-9 items-center gap-2 border-t text-[12.5px] transition-colors',
          collapsed ? 'justify-center' : 'px-4',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        ) : (
          <>
            <PanelLeftClose className="size-4" aria-hidden="true" />
            Collapse
          </>
        )}
      </button>
    </aside>
  );
}

/**
 * Mobile drawer plus the hamburger that opens it. Rendered inside the top bar
 * so the trigger sits next to the rest of the header controls.
 */
export function SidebarMobile({
  nav,
  profileHref,
}: {
  nav: SidebarNavItem[];
  profileHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change so the drawer is never left hanging over the page it
  // navigated to — including on browser back/forward, which no click handler
  // would catch. Adjusting state during render (rather than in an effect) is
  // React's documented pattern for this and avoids a second render pass.
  const [navigatedFrom, setNavigatedFrom] = useState(pathname);
  if (pathname !== navigatedFrom) {
    setNavigatedFrom(pathname);
    setOpen(false);
  }

  // Close on Escape, and stop the page behind the drawer from scrolling.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="text-muted-foreground hover:bg-surface-hover hover:text-foreground rounded-control -ml-1 p-2 transition-colors md:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {/* Backdrop. Kept mounted so it can fade rather than pop. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={cn(
          'bg-overlay fixed inset-0 z-40 transition-opacity duration-200 md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform duration-200 ease-out md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarBrand collapsed={false} onClose={() => setOpen(false)} />
        <NavList nav={nav} collapsed={false} onNavigate={() => setOpen(false)} />
        <SidebarFooter
          collapsed={false}
          profileHref={profileHref}
          onNavigate={() => setOpen(false)}
        />
      </div>
    </>
  );
}
