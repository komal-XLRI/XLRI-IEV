'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ROLE_HOME, ROLE_LABELS, type Role } from '@/lib/constants/roles';

/**
 * Trail derived from the URL rather than declared per page.
 *
 * Deriving it means every route gets a correct trail for free and none can be
 * forgotten, which is the usual failure of hand-written breadcrumbs. The
 * trade-off is that identifier segments have no name of their own; those are
 * rendered as a neutral "Detail" rather than as a raw ObjectId, which tells the
 * reader nothing and looks broken.
 */

/** Segments whose title is not simply their slug. */
const LABELS: Record<string, string> = {
  admin: 'Admin',
  student: 'Student',
  faculty: 'Faculty',
  mentor: 'Mentor',
  attendance: 'Attendance',
  consolidated: 'Consolidated',
  students: 'Students',
  mentors: 'Mentors',
  ventures: 'Ventures',
  'venture-activities': 'Venture Activities',
  'support-activities': 'Support Activities',
  academic: 'Academic',
  subjects: 'Subjects',
  sessions: 'Classes',
  workshops: 'Workshops',
  reviews: 'Reviews',
  reports: 'Reports',
  submissions: 'Submissions',
  activities: 'Activities',
  venture: 'My venture',
  support: 'Support activities',
  profile: 'Profile',
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

function labelFor(segment: string): string {
  if (LABELS[segment]) return LABELS[segment];
  if (OBJECT_ID.test(segment)) return 'Detail';
  return segment.replace(/-/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

export function Breadcrumbs({ role }: { role: Role }) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // The first segment is the role's own root, which the "home" crumb already
  // covers — repeating it would make every trail start "Admin / Admin".
  const trail = segments.slice(1);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="type-caption flex min-w-0 items-center gap-1">
        <li className="shrink-0">
          <Link href={ROLE_HOME[role]} className="hover:text-foreground transition-colors">
            {ROLE_LABELS[role]}
          </Link>
        </li>

        {trail.map((segment, index) => {
          const href = `/${segments.slice(0, index + 2).join('/')}`;
          const isLast = index === trail.length - 1;

          return (
            <li key={href} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="text-subtle-foreground size-3 shrink-0" aria-hidden="true" />
              {isLast ? (
                <span className="text-foreground truncate font-medium" aria-current="page">
                  {labelFor(segment)}
                </span>
              ) : (
                <Link href={href} className="hover:text-foreground truncate transition-colors">
                  {labelFor(segment)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
