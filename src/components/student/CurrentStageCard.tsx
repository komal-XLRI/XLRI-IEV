import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  HeartHandshake,
  MessagesSquare,
  PartyPopper,
  Presentation,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { ActivityStatusBadge, Badge } from '@/components/ui/Badge';
import { MeterBar } from '@/components/ui/Chart';
import { BEHAVIOUR_RATING_MAX } from '@/lib/constants/behaviour';
import { daysUntil, formatDate, formatDateRange, windowState } from '@/lib/utils/dates';
import type { TimelineRow } from '@/types/progress';
import type { StudentPresentationFeedback } from '@/services/ventures/mentorFeedbackService';
import type { BehaviourFeedbackView } from '@/services/ventures/behaviourService';

export interface CurrentStageData {
  row: TimelineRow;
  presentations: StudentPresentationFeedback[];
  feedback: { counted: number; required: number; complete: boolean; formConfigured: boolean };
  behaviour: BehaviourFeedbackView | null;
}

/** "Opens in 3 days" / "5 days left" / "Closed 2 days ago" — the question a student actually has. */
function windowLabel(row: TimelineRow, now: Date) {
  const state = windowState(new Date(row.startDate), new Date(row.endDate), now);
  if (state === 'BEFORE') {
    const days = daysUntil(row.startDate, now);
    return {
      tone: 'neutral' as const,
      text: days === 1 ? 'Opens tomorrow' : `Opens in ${days} days`,
    };
  }
  if (state === 'OPEN') {
    const days = daysUntil(row.endDate, now);
    return {
      tone: 'success' as const,
      text: days === 0 ? 'Last day' : days === 1 ? '1 day left' : `${days} days left`,
    };
  }
  return { tone: 'warning' as const, text: 'Window closed' };
}

/** The one sentence that tells the student what happens next on this stage. */
function nextStep({ presentations, feedback }: CurrentStageData): string {
  const live = presentations.filter((p) => p.status !== 'CANCELLED');
  const received = live.filter((p) => p.received);
  const upcoming = live.find((p) => !p.received);

  if (received.length === 0) {
    if (!upcoming) {
      return 'Your programme office will schedule your presentation for this stage. Its date will appear here.';
    }
    return `Present on ${formatDate(upcoming.presentedOn)}${
      upcoming.startTime ? ` at ${upcoming.startTime}` : ''
    }. The programme office marks it received once you have presented.`;
  }
  if (feedback.complete) {
    return 'Your presentation is in and mentor feedback is complete — this stage is done.';
  }
  const remaining = Math.max(feedback.required - feedback.counted, 1);
  return `Your presentation is in. Mentors give feedback by scanning your QR code at the presentation — ${remaining} more response${remaining === 1 ? '' : 's'} and this stage is complete.`;
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-control surface-sunken border p-3.5">
      <p className="type-overline mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * The first thing a student sees: the stage they are on, what they have done
 * on it, what they have been told about it, and what to do next.
 */
export function CurrentStageCard({ data }: { data: CurrentStageData }) {
  const { row, presentations, feedback, behaviour } = data;
  const now = new Date();
  const window = windowLabel(row, now);
  const href = `/student/activities/${row.recordId}`;
  const presented = presentations.some((p) => p.received);

  return (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-overline">Your current stage</p>
            <h2 className="mt-1 text-lg font-semibold">
              <span className="text-muted-foreground font-mono text-base">{row.activityCode}</span>{' '}
              {row.name}
            </h2>
            <p className="type-secondary mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {formatDateRange(row.startDate, row.endDate)}
              </span>
              <Badge tone={window.tone}>{window.text}</Badge>
            </p>
          </div>
          <ActivityStatusBadge state={row.uiState} />
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-3">
        <Block icon={Presentation} title="Your presentation">
          {presentations.length === 0 ? (
            <p className="type-secondary">Not scheduled yet.</p>
          ) : (
            <ul className="space-y-2">
              {presentations.map((p) => (
                <li key={p.participantId} className="text-[13px]">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {formatDate(p.presentedOn)}
                      {p.startTime ? ` · ${p.startTime}` : ''}
                    </span>
                    <Badge
                      tone={p.status === 'CANCELLED' ? 'muted' : p.received ? 'success' : 'neutral'}
                    >
                      {p.status === 'CANCELLED'
                        ? 'Cancelled'
                        : p.received
                          ? 'Received'
                          : 'Scheduled'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block icon={MessagesSquare} title="Mentor feedback">
          {!presented ? (
            <p className="type-secondary">Opens after your presentation is received.</p>
          ) : feedback.complete ? (
            <p className="text-success-soft-foreground flex items-center gap-1.5 text-[13.5px] font-medium">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete · {feedback.counted} response{feedback.counted === 1 ? '' : 's'}
            </p>
          ) : (
            <>
              <p className="text-[13.5px] font-medium tabular-nums">
                {feedback.counted} of {feedback.required} response
                {feedback.required === 1 ? '' : 's'}
              </p>
              <MeterBar
                value={feedback.counted}
                max={Math.max(1, feedback.required)}
                size="sm"
                showValue={false}
                tone="accent"
                label="Mentor feedback received"
              />
            </>
          )}
        </Block>

        <Block icon={HeartHandshake} title="HR & behaviour">
          {behaviour ? (
            <p className="text-[13.5px]">
              <span className="font-medium tabular-nums">
                {behaviour.average.toFixed(1)} / {BEHAVIOUR_RATING_MAX}
              </span>{' '}
              <span className="type-caption">given {formatDate(behaviour.givenAt)}</span>
            </p>
          ) : (
            <p className="type-secondary">Given by the programme office during the stage.</p>
          )}
        </Block>
      </div>

      <div className="surface-sunken flex flex-wrap items-center gap-3 border-t px-5 py-3.5">
        <p className="type-secondary min-w-0 flex-1">
          <span className="text-foreground font-medium">Next: </span>
          {nextStep(data)}
        </p>
        <Link
          href={href}
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Open stage
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

/** Shown instead once every stage is complete. */
export function AllStagesComplete({ total }: { total: number }) {
  return (
    <Card className="px-5 py-6">
      <div className="flex items-center gap-3">
        <span className="bg-success-soft text-success-soft-foreground inline-flex size-10 items-center justify-center rounded-full">
          <PartyPopper className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[15px] font-semibold">All {total} stages complete</p>
          <p className="type-secondary">
            Every presentation is in and every stage has its feedback. Your full history is below.
          </p>
        </div>
      </div>
    </Card>
  );
}
