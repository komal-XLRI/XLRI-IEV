import type { ReactNode } from 'react';
import { Sidebar, SidebarMobile, type SidebarNavItem } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { NotificationsMenu, type HeaderAlertItem } from './NotificationsMenu';
import { UserMenu } from './UserMenu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { XlriLogo } from '@/components/branding/XlriLogo';
import { PrintLetterhead } from '@/components/branding/PrintLetterhead';
import { ToastProvider } from '@/components/ui/Toast';
import type { Role } from '@/lib/constants/roles';

export type { NavIconName } from './Sidebar';

/**
 * Nav items are declared in the role layouts, which are Server Components, so
 * every field here has to be serializable — hence `icon` being a name rather
 * than a component reference.
 */
export type NavItem = SidebarNavItem;

export function AppShell({
  role,
  userName,
  nav,
  alerts = [],
  profileHref,
  children,
}: {
  role: Role;
  userName: string;
  nav: NavItem[];
  /** Live counts of records needing action; see `getHeaderAlerts`. */
  alerts?: HeaderAlertItem[];
  profileHref?: string;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="bg-background flex min-h-screen">
        <Sidebar nav={nav} profileHref={profileHref} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-app-header=""
            className="bg-header/90 border-header-border text-header-foreground sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6"
          >
            <SidebarMobile nav={nav} profileHref={profileHref} />

            {/* Below `md` the rail is closed, so this is the only place the mark
                appears; above it the rail carries it and repeating it here
                would just be noise. */}
            <div className="md:hidden">
              <XlriLogo height={18} priority />
            </div>

            <div className="hidden min-w-0 md:block">
              <Breadcrumbs role={role} />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <NotificationsMenu alerts={alerts} />
              <ThemeToggle />
              <span aria-hidden="true" className="bg-border mx-0.5 hidden h-6 w-px sm:block" />
              <UserMenu userName={userName} role={role} profileHref={profileHref} />
            </div>
          </header>

          <main data-app-content="" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6 lg:px-8">
            <PrintLetterhead role={role} userName={userName} />
            <div className="mx-auto w-full max-w-[100rem]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

/**
 * The title block at the top of a page.
 *
 * `eyebrow` names the area, the title names the page, and the description says
 * what it is for. Having all three in one component is what stops page headings
 * drifting into three different shapes across a dozen screens.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Chips or counts that qualify the title — kept beside it, not below. */
  meta?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <p className="type-overline mb-1">{eyebrow}</p> : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="type-page-title">{title}</h1>
          {meta}
        </div>

        {description ? <p className="type-secondary mt-1 max-w-2xl">{description}</p> : null}
      </div>

      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2" data-print="hide">
          {action}
        </div>
      ) : null}
    </div>
  );
}
