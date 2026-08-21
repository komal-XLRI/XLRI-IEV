'use client';

import { useRouter } from 'next/navigation';
import { COMPACT_CONTROL_CLASSES } from '@/components/ui/Field';

/**
 * Moves between individual reports without going back to the grid.
 *
 * Navigates rather than filters: which student this report is about is part of
 * the path, so it can be linked to and reloaded. Putting it in the query string
 * would make "the individual report" a single page that means something
 * different depending on state nobody can see in the URL bar.
 */
export function StudentAttendanceSwitcher({
  current,
  options,
}: {
  current: string;
  options: Array<{ _id: string; ventureName: string; studentName: string }>;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2">
      <span className="type-caption">Student</span>
      <select
        value={current}
        onChange={(event) => router.push(`/admin/attendance/student/${event.target.value}`)}
        className={COMPACT_CONTROL_CLASSES}
        aria-label="Show another student's attendance"
      >
        {options.map((option) => (
          <option key={option._id} value={option._id}>
            {option.studentName} — {option.ventureName}
          </option>
        ))}
      </select>
    </label>
  );
}
