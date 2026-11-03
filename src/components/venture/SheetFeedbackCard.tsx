import { FileSpreadsheet, UserRound } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { StudentSheetFeedback } from '@/services/ventures/stageFeedbackSheetService';
import { formatDate } from '@/lib/utils/dates';

/** The column naming who gave the feedback, used as the response's heading. */
const EVALUATOR_LABEL = /evaluator|mentor|faculty|reviewer|judge|assessor/i;

function splitEvaluator(fields: StudentSheetFeedback['fields']) {
  const index = fields.findIndex((field) => EVALUATOR_LABEL.test(field.label));
  if (index === -1) return { evaluator: null, rest: fields };
  return { evaluator: fields[index]!.value, rest: fields.filter((_, i) => i !== index) };
}

/**
 * A student's own rows from the feedback sheets uploaded for a stage — one
 * block per evaluator. Renders nothing until a sheet with their row in it has
 * been uploaded.
 */
export function SheetFeedbackCard({ entries }: { entries: StudentSheetFeedback[] }) {
  if (entries.length === 0) return null;

  const sheets = new Map<string, StudentSheetFeedback[]>();
  for (const entry of entries)
    sheets.set(entry.sheetId, [...(sheets.get(entry.sheetId) ?? []), entry]);

  return (
    <Card className="mt-5">
      <CardHeader
        title="Evaluator feedback"
        description="Feedback on your work for this stage. Only your own feedback is shown here."
        icon={FileSpreadsheet}
        action={
          <Badge tone="info">
            {entries.length} response{entries.length === 1 ? '' : 's'}
          </Badge>
        }
      />
      <CardBody className="space-y-6">
        {[...sheets.values()].map((rows) => (
          <section key={rows[0]!.sheetId} className="space-y-3">
            <h3 className="type-overline flex flex-wrap items-center gap-2">
              {rows[0]!.sheetTitle}
              <span className="text-muted-foreground font-normal normal-case">
                · shared {formatDate(rows[0]!.sharedAt)}
              </span>
            </h3>

            {rows.map((entry, position) => {
              const { evaluator, rest } = splitEvaluator(entry.fields);
              return (
                <div key={entry.entryId} className="rounded-control border">
                  <p className="surface-sunken flex items-center gap-2 border-b px-3.5 py-2 text-[13.5px] font-medium">
                    <UserRound className="text-muted-foreground size-4" aria-hidden="true" />
                    {evaluator ?? `Response ${position + 1}`}
                  </p>
                  {rest.length === 0 ? (
                    <p className="type-caption px-3.5 py-2.5">No feedback was filled in.</p>
                  ) : (
                    <dl className="divide-border divide-y">
                      {rest.map((field, index) => (
                        <div
                          key={`${field.label}-${index}`}
                          className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(12rem,1fr)_minmax(0,1fr)] sm:gap-4"
                        >
                          <dt className="text-muted-foreground text-[13px]">{field.label}</dt>
                          <dd className="text-sm font-medium whitespace-pre-wrap">{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </CardBody>
    </Card>
  );
}
