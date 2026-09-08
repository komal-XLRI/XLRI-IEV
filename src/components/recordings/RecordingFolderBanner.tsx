import type { ReactNode } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * The one Drive folder holding all the presentations, above the register.
 *
 * A banner rather than a row in the table: it is not a session, it has no date
 * or batch, and filing it as a row would put something in the register that
 * every column is wrong for.
 *
 * `action` is where the administrator's edit button goes. Faculty are passed
 * nothing, and see the link alone.
 */
export function RecordingFolderBanner({
  link,
  action,
}: {
  link: string | null;
  action?: ReactNode;
}) {
  if (!link && !action) return null;

  return (
    <Card className="mb-4">
      <CardBody className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="bg-primary-soft text-primary-soft-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md">
            <FolderOpen className="size-3.5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <p className="type-card-title">All presentations</p>

            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary type-secondary inline-flex items-center gap-1.5 font-medium hover:underline"
              >
                Open the Drive folder
                <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              </a>
            ) : (
              <p className="type-secondary">No folder link set yet.</p>
            )}
          </div>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </CardBody>
    </Card>
  );
}
