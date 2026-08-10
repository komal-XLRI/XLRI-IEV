import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** Tables scroll inside their own container so the page body never scrolls sideways. */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cn(
        // A tinted header band rather than a bare rule: on a long list it keeps
        // the column names attached to the data when the page is scrolled past.
        'bg-table-header text-table-header-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'border-b px-4 py-3 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Zebra striping plus a hover cue, so a wide row stays readable across. */
export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn('even:bg-table-row-alt hover:bg-table-row-hover transition-colors', className)}
    >
      {children}
    </tr>
  );
}
