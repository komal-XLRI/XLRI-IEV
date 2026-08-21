import Link from 'next/link';
import { CalendarCheck, Grid3x3, Presentation, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The three ways of reading the same register.
 *
 * Separate routes rather than client-side tabs, because each view carries its
 * own filters in the URL and its own export. A tab that only swapped a
 * component would leave the export menu pointing at whichever dataset happened
 * to be mounted, and a shared link would not reopen what the sender was looking
 * at.
 */
const TABS = [
  {
    key: 'register',
    href: '/admin/attendance',
    label: 'Register',
    hint: 'Mark and edit by date',
    icon: CalendarCheck,
  },
  {
    key: 'consolidated',
    href: '/admin/attendance/consolidated',
    label: 'Consolidated',
    hint: 'Every student against every activity',
    icon: Grid3x3,
  },
  {
    key: 'workshops',
    href: '/admin/attendance/workshops',
    label: 'Workshops',
    hint: 'One register per workshop',
    icon: Presentation,
  },
] as const;

export type AttendanceTab = (typeof TABS)[number]['key'] | 'individual';

export function AttendanceTabs({ active }: { active: AttendanceTab }) {
  return (
    <nav aria-label="Attendance views" className="border-border mb-5 flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => {
        const current = tab.key === active;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            title={tab.hint}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors',
              current
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}

      {/* Only ever the current page: there is no "the" individual report, so
          this appears once one has been opened and never as an empty link. */}
      {active === 'individual' ? (
        <span
          aria-current="page"
          className="border-primary text-primary inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-medium"
        >
          <User className="size-4 shrink-0" aria-hidden="true" />
          Individual
        </span>
      ) : null}
    </nav>
  );
}
