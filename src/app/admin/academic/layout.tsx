import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/AppShell';
import { NavLink } from '@/components/layout/NavLink';

const TABS = [
  { href: '/admin/academic', label: 'Terms', exact: true },
  { href: '/admin/academic/subjects', label: 'Subjects' },
  { href: '/admin/academic/sessions', label: 'Classes' },
  { href: '/admin/academic/workshops', label: 'Expert workshops' },
];

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Academic"
        title="Academic structure"
        description="Terms, subjects, teaching assignments and the class schedule that Expert Workshops attach to."
      />

      {/* A tablist rather than a row of links: these switch a view inside one
          area, which is what a reader and a screen reader both expect here. */}
      <nav className="mb-5 overflow-x-auto" aria-label="Academic sections">
        <ul className="surface-card rounded-card inline-flex gap-1 p-1">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <NavLink href={tab.href} exact={tab.exact}>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </>
  );
}
