import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { LOGO_ASPECT_RATIO } from '@/lib/branding/logoArt';

const LOGO_SRC = '/xlri-logo.svg';
const LOGO_ALT = 'XLRI Xavier School of Management';

/**
 * The official mark, used as supplied.
 *
 * Only the height is chosen at the call site; the width follows from the
 * artwork's own viewBox, so the logo can never be stretched or squashed. It is
 * served as a vector and left unoptimised — rasterising a logo would be a
 * downgrade, and it is our own asset.
 *
 * `plate` puts the mark on a light field. The shield is a deep navy (#1B4E9B),
 * which has too little separation from a dark surface to read well; the plate
 * restores the contrast the artwork was drawn for without touching the artwork
 * itself.
 *
 * The field comes from the `--logo-plate` token — transparent with no padding
 * in light mode, a light field in dark — which is the same token the navigation
 * rail uses. A literal `bg-white` here would have been a second, independent
 * answer to the same question, and the kind of hardcoded colour that survives a
 * theme change unnoticed.
 */
export function XlriLogo({
  height = 28,
  plate = false,
  className,
  priority = false,
}: {
  height?: number;
  plate?: boolean;
  className?: string;
  priority?: boolean;
}) {
  // next/image needs integer intrinsic dimensions to reserve layout space, but
  // rounding them would pin the rendered box to a ratio up to half a percent off
  // the artwork's. Fixing only the height and letting the width resolve from the
  // SVG's own viewBox keeps the ratio exact while still reserving the right box.
  const reservedWidth = Math.round(height * LOGO_ASPECT_RATIO);

  const image = (
    <Image
      src={LOGO_SRC}
      alt={LOGO_ALT}
      width={reservedWidth}
      height={height}
      priority={priority}
      unoptimized
      className={cn('max-w-full', !plate && className)}
      style={{ height, width: 'auto' }}
    />
  );

  if (!plate) return image;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-(--logo-plate) p-(--logo-plate-pad)',
        className,
      )}
    >
      {image}
    </span>
  );
}

/**
 * Logo plus the application's own name.
 *
 * The two are kept apart by a rule rather than run together, which is how an
 * institution's mark is normally paired with a sub-brand: XLRI is the
 * institution, the tracker is one of its systems.
 */
export function XlriLockup({
  height = 26,
  plate = false,
  tone = 'default',
  className,
  priority = false,
}: {
  height?: number;
  plate?: boolean;
  /** `onBrand` is for the navy rail, where the text sits on a dark field. */
  tone?: 'default' | 'onBrand';
  className?: string;
  priority?: boolean;
}) {
  const onBrand = tone === 'onBrand';

  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <XlriLogo height={height} plate={plate} priority={priority} />

      <span
        aria-hidden="true"
        className={cn('h-8 w-px shrink-0', onBrand ? 'bg-sidebar-border' : 'bg-border')}
      />

      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            'block truncate text-[13px] font-semibold',
            onBrand ? 'text-sidebar-foreground' : 'text-foreground',
          )}
        >
          IEV Activity Tracker
        </span>
        <span
          className={cn(
            'block truncate text-[10.5px] tracking-[0.14em] uppercase',
            onBrand ? 'text-sidebar-muted' : 'text-muted-foreground',
          )}
        >
          Entrepreneurship &amp; Venturing
        </span>
      </span>
    </span>
  );
}
