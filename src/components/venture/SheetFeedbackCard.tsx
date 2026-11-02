import { FileSpreadsheet } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { StudentSheetFeedback } from '@/services/ventures/stageFeedbackSheetService';
import { formatDate } from '@/lib/utils/dates';

/**
 * A student's own rows from the feedback sheets uploaded for a stage. Renders
 * nothing until a sheet with their row in it has been uploaded.
 */
export function SheetFeedbackCard({ entries }: { entries: StudentSheetFeedback[] }) {
  if (entries.length === 0) return null;

  return (
    <Card className="mt-5">
      <CardHeader
        title="Feedback from your programme office"
        description="Your own feedback for this stage. Nobody else's is shown here."
        icon={FileSpreadsheet}
        action={<Badge tone="info">{entries.length} shared</Badge>}
      />
      <CardBody className="space-y-5">
        {entries.map((entry) => (
          <section key={entry.entryId} className="space-y-2">
            <h3 className="type-overline flex flex-wrap items-center gap-2">
              {entry.sheetTitle}
              <span className="text-muted-foreground font-normal normal-case">
                · {formatDate(entry.sharedAt)}
              </span>
            </h3>
            {entry.fields.length === 0 ? (
              <p className="type-caption">This row has no feedback filled in.</p>
            ) : (
              <dl className="divide-border rounded-control divide-y border">
                {entry.fields.map((field, index) => (
                  <div
                    key={`${field.label}-${index}`}
                    className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(10rem,16rem)_1fr] sm:gap-4"
                  >
                    <dt className="text-muted-foreground text-[13px]">{field.label}</dt>
                    <dd className="text-sm whitespace-pre-wrap">{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </CardBody>
    </Card>
  );
}
