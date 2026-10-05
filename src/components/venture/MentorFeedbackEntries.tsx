import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/utils/dates';
import type { MentorFeedbackEntry } from '@/services/ventures/mentorFeedbackService';

function Answer({ value }: { value: string | string[] | string[][] }) {
  if (typeof value === 'string') {
    return value.trim() === '' ? (
      <span className="text-muted-foreground">No answer</span>
    ) : (
      <span className="whitespace-pre-wrap">{value}</span>
    );
  }
  if (value.length === 0) return <span className="text-muted-foreground">No answer</span>;

  // A grid arrives as one list per row.
  if (Array.isArray(value[0])) {
    return (
      <ul className="space-y-0.5">
        {(value as string[][]).map((row, index) => (
          <li key={index}>{row.filter(Boolean).join(', ') || '—'}</li>
        ))}
      </ul>
    );
  }
  return <span>{(value as string[]).join(', ')}</span>;
}

/**
 * Mentor feedback as it came from Google Forms. Nothing here knows the
 * questions — each stage's form can ask different things — so every response
 * is rendered from its own question/answer list, in form order.
 */
export function MentorFeedbackEntries({
  entries,
  showSuperseded = false,
}: {
  entries: MentorFeedbackEntry[];
  /** Administrators also see earlier responses a mentor later replaced. */
  showSuperseded?: boolean;
}) {
  const visible = showSuperseded ? entries : entries.filter((entry) => !entry.superseded);

  return (
    <ol className="space-y-3">
      {visible.map((entry, index) => (
        <li key={entry.id} className="surface-sunken rounded-control border px-3.5 py-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13.5px] font-semibold">
              Mentor feedback {index + 1}
              {entry.mentorName ? (
                <span className="text-muted-foreground font-normal"> · {entry.mentorName}</span>
              ) : null}
              {entry.mentorEmail ? (
                <span className="text-muted-foreground font-normal"> · {entry.mentorEmail}</span>
              ) : null}
            </p>
            <span className="flex items-center gap-2">
              {entry.superseded ? <Badge tone="muted">Superseded</Badge> : null}
              <span className="type-caption">{formatDateTime(entry.submittedAt)}</span>
            </span>
          </div>

          <dl className="space-y-2.5">
            {entry.responses.map((item, i) => (
              <div key={i}>
                <dt className="text-muted-foreground text-[12.5px] font-medium">{item.question}</dt>
                <dd className="mt-0.5 text-sm">
                  <Answer value={item.answer} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}
