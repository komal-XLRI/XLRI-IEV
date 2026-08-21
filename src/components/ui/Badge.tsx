import type { ReactNode } from 'react';
import {
  Blend,
  CalendarCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  CheckCircle2,
  Lock,
  MapPin,
  OctagonAlert,
  RotateCcw,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  ATTENDANCE_MARK_LABELS,
  type ReviewStatus,
  type UiActivityState,
  type AttendanceMark,
} from '@/lib/constants/status';
import {
  WORKSHOP_MODE_LABELS,
  WORKSHOP_STATUS_LABELS,
  type WorkshopMode,
  type WorkshopStatus,
} from '@/lib/constants/workshops';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

/**
 * Every tone is a tint + a matching text colour + a border, all drawn from the
 * token set — so a badge is legible against either canvas without a single
 * `dark:` override, and a new theme needs no change here.
 */
const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-muted text-foreground border-border',
  info: 'bg-info-soft text-info-soft-foreground border-info-border',
  success: 'bg-success-soft text-success-soft-foreground border-success-border',
  warning: 'bg-warning-soft text-warning-soft-foreground border-warning-border',
  danger: 'bg-danger-soft text-danger-soft-foreground border-danger-border',
  muted: 'bg-muted text-muted-foreground border-border',
};

export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const ACTIVITY_TONE: Record<UiActivityState, Tone> = {
  LOCKED: 'muted',
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'info',
  UNDER_REVIEW: 'warning',
  REVISION_REQUIRED: 'warning',
  COMPLETED: 'success',
  MAX_ATTEMPTS_REACHED: 'danger',
};

const ACTIVITY_LABEL: Record<UiActivityState, string> = {
  LOCKED: 'Locked',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  UNDER_REVIEW: 'Under review',
  REVISION_REQUIRED: 'Revision required',
  COMPLETED: 'Completed',
  MAX_ATTEMPTS_REACHED: 'Max attempts reached',
};

/**
 * Icons matter here beyond decoration: "Under review" and "Revision required"
 * share the warning tone, so colour alone cannot tell them apart — and neither
 * can a colour-blind reader distinguish success from danger. The label carries
 * the meaning and the icon reinforces it.
 */
const ACTIVITY_ICON: Record<UiActivityState, LucideIcon> = {
  LOCKED: Lock,
  NOT_STARTED: CircleDashed,
  IN_PROGRESS: Clock,
  UNDER_REVIEW: Clock,
  REVISION_REQUIRED: RotateCcw,
  COMPLETED: CheckCircle2,
  MAX_ATTEMPTS_REACHED: OctagonAlert,
};

export function ActivityStatusBadge({ state }: { state: UiActivityState }) {
  return (
    <Badge tone={ACTIVITY_TONE[state]} icon={ACTIVITY_ICON[state]}>
      {ACTIVITY_LABEL[state]}
    </Badge>
  );
}

const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  PENDING: 'neutral',
  APPROVED: 'success',
  REVISION_REQUIRED: 'warning',
  REJECTED: 'danger',
};

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REVISION_REQUIRED: 'Revision required',
  REJECTED: 'Rejected',
};

const REVIEW_ICON: Record<ReviewStatus, LucideIcon> = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REVISION_REQUIRED: RotateCcw,
  REJECTED: CircleSlash,
};

export function ReviewStatusBadge({ status, prefix }: { status: ReviewStatus; prefix?: string }) {
  return (
    <Badge tone={REVIEW_TONE[status]} icon={REVIEW_ICON[status]}>
      {prefix ? `${prefix}: ` : ''}
      {REVIEW_LABEL[status]}
    </Badge>
  );
}

const ATTENDANCE_TONE: Record<AttendanceMark, Tone> = {
  PRESENT: 'success',
  ABSENT: 'danger',
};

const ATTENDANCE_ICON: Record<AttendanceMark, LucideIcon> = {
  PRESENT: CheckCircle2,
  ABSENT: CircleSlash,
};

/**
 * Attendance on a Venture Activity.
 *
 * Only two values reach here. "Not marked" is the absence of a record rather
 * than a status, so the caller renders nothing at all in that case — a badge
 * saying "pending" would put an administrative gap on the student.
 */
export function AttendanceBadge({ status }: { status: AttendanceMark }) {
  return (
    <Badge tone={ATTENDANCE_TONE[status]} icon={ATTENDANCE_ICON[status]}>
      {ATTENDANCE_MARK_LABELS[status]}
    </Badge>
  );
}

const WORKSHOP_TONE: Record<WorkshopStatus, Tone> = {
  DRAFT: 'muted',
  PUBLISHED: 'success',
  COMPLETED: 'info',
  CANCELLED: 'danger',
};

const WORKSHOP_ICON: Record<WorkshopStatus, LucideIcon> = {
  DRAFT: CircleDashed,
  PUBLISHED: CheckCircle2,
  COMPLETED: CalendarCheck,
  CANCELLED: CircleSlash,
};

export function WorkshopStatusBadge({ status }: { status: WorkshopStatus }) {
  return (
    <Badge tone={WORKSHOP_TONE[status]} icon={WORKSHOP_ICON[status]}>
      {WORKSHOP_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Mode reads as neutral in every state: it is a property of the event, not a
 * verdict on it, and tinting it would compete with the status badge beside it.
 */
const WORKSHOP_MODE_ICON: Record<WorkshopMode, LucideIcon> = {
  ONLINE: Video,
  OFFLINE: MapPin,
  HYBRID: Blend,
};

export function WorkshopModeBadge({ mode }: { mode: WorkshopMode }) {
  return (
    <Badge tone="neutral" icon={WORKSHOP_MODE_ICON[mode]}>
      {WORKSHOP_MODE_LABELS[mode]}
    </Badge>
  );
}
