import { UsersRound } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';
import {
  BEHAVIOUR_AREAS,
  BEHAVIOUR_RATING_LABELS,
  BEHAVIOUR_RATING_MAX,
} from '@/lib/constants/behaviour';
import type { BehaviourFeedbackView } from '@/services/ventures/behaviourService';
import { formatDate } from '@/lib/utils/dates';

/** A student's HR & behaviour feedback on one stage, as they see it. */
export function BehaviourFeedbackCard({ feedback }: { feedback: BehaviourFeedbackView | null }) {
  return (
    <Card>
      <CardHeader
        title="HR & behaviour feedback"
        description="How you worked with people during this stage, from your programme office."
        icon={UsersRound}
        action={
          feedback ? <Badge tone="info">Average {feedback.average.toFixed(1)} / 5</Badge> : null
        }
      />

      {feedback ? (
        <CardBody className="space-y-4">
          <ul className="space-y-2.5">
            {BEHAVIOUR_AREAS.map((area) => {
              const value = feedback.ratings[area.key];
              return (
                <li key={area.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-44 flex-1 text-[13px] font-medium">{area.label}</span>
                  <span
                    className="flex items-center gap-1"
                    role="img"
                    aria-label={`${value} out of ${BEHAVIOUR_RATING_MAX}`}
                  >
                    {Array.from({ length: BEHAVIOUR_RATING_MAX }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          'h-1.5 w-5 rounded-full',
                          index < value ? 'bg-chart-1' : 'bg-chart-track',
                        )}
                      />
                    ))}
                  </span>
                  <span className="type-caption w-44 text-right">
                    {value} · {BEHAVIOUR_RATING_LABELS[value]}
                  </span>
                </li>
              );
            })}
          </ul>

          {feedback.comments ? (
            <div className="surface-sunken rounded-control border px-3 py-2.5">
              <p className="type-overline mb-1">Feedback</p>
              <p className="text-sm whitespace-pre-wrap">{feedback.comments}</p>
            </div>
          ) : null}

          <p className="type-caption">
            Given {formatDate(feedback.givenAt)}
            {feedback.edited ? ` · last updated ${formatDate(feedback.updatedAt)}` : ''}
          </p>
        </CardBody>
      ) : (
        <EmptyState
          size="sm"
          title="No feedback yet"
          description="Your programme office adds this over the course of the stage."
        />
      )}
    </Card>
  );
}
