'use client';

import { useState } from 'react';
import { ImportPanel, type ImportColumnView } from '@/components/import/ImportPanel';
import { Select } from '@/components/ui/Field';

export interface FeedbackImportTarget {
  _id: string;
  title: string;
  /** Already formatted; this component does no date work of its own. */
  date: string;
}

/**
 * Starting a feedback import, from a page that may or may not already know
 * which workshop it is for.
 *
 * A feedback export has no column naming the workshop — the person who
 * exported it knew which form they were looking at — so the workshop has to
 * come from here. On a workshop's own page it is settled and this renders the
 * import button alone. On the list, where the button is just as useful, the
 * question has to be asked first, and the button stays disabled until it is
 * answered rather than opening a dialog that would fail on submit.
 */
export function WorkshopFeedbackImport({
  spec,
  title,
  description,
  columns,
  workshopId,
  workshops,
}: {
  spec: string;
  title: string;
  description: string;
  columns: ImportColumnView[];
  /** Set on a workshop's own page, where there is nothing to choose. */
  workshopId?: string;
  /** Offered on the list page. Ignored when `workshopId` is set. */
  workshops?: FeedbackImportTarget[];
}) {
  const [chosen, setChosen] = useState('');
  const selected = workshopId ?? chosen;

  const panel = (
    <ImportPanel
      spec={spec}
      title={title}
      description={description}
      columns={columns}
      label="Import feedback"
      params={selected ? { workshopId: selected } : undefined}
      disabled={!selected}
      disabledHint="Choose which workshop this feedback is for first."
    />
  );

  if (workshopId) return panel;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor="feedback-workshop" className="sr-only">
        Workshop this feedback is for
      </label>
      <Select
        id="feedback-workshop"
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
        className="w-auto min-w-[13rem] max-w-full"
      >
        <option value="">Feedback for…</option>
        {(workshops ?? []).map((workshop) => (
          <option key={workshop._id} value={workshop._id}>
            {workshop.title} · {workshop.date}
          </option>
        ))}
      </Select>

      {panel}
    </span>
  );
}
