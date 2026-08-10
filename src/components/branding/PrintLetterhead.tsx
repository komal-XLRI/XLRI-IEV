import { XlriLogo } from './XlriLogo';
import { formatDateTime } from '@/lib/utils/dates';
import { ROLE_LABELS, type Role } from '@/lib/constants/roles';

/**
 * Branded letterhead that exists only on paper.
 *
 * Pressing Ctrl+P on any screen should produce something an office can file:
 * the print stylesheet strips the rail, the top bar and every control, which
 * would otherwise leave the page with no indication of where it came from.
 * This puts the institution, the system, the timestamp and the person who ran
 * it back at the top.
 *
 * Hidden on screen by `hidden`; revealed by the `[data-print='only']` rule in
 * globals.css, which also outranks it.
 */
export function PrintLetterhead({ role, userName }: { role: Role; userName: string }) {
  return (
    <div data-print="only" className="hidden">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '16px',
          borderBottom: '2px solid #1b4e9b',
          paddingBottom: '10px',
          marginBottom: '18px',
        }}
      >
        <div>
          {/* Eager: the block is display:none until the print stylesheet
              applies, and a lazily-loaded image inside it would never be
              fetched — the letterhead would print with a gap where the mark
              should be. */}
          <XlriLogo height={30} priority />
          <div
            style={{
              marginTop: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#16181d',
            }}
          >
            IEV Activity Tracker
          </div>
          <div
            style={{
              fontSize: '9.5px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#4a5057',
            }}
          >
            Entrepreneurship &amp; Venturing Programme
          </div>
        </div>

        <div style={{ fontSize: '10px', color: '#4a5057', textAlign: 'right', lineHeight: 1.6 }}>
          <div>
            <strong style={{ color: '#16181d' }}>Generated</strong> {formatDateTime(new Date())} UTC
          </div>
          <div>
            <strong style={{ color: '#16181d' }}>By</strong> {userName} ({ROLE_LABELS[role]})
          </div>
        </div>
      </div>

      {/* The lime rule from the 75-years mark, used once as a signature. */}
      <div
        aria-hidden="true"
        style={{ height: '3px', width: '64px', background: '#bccf17', marginBottom: '16px' }}
      />
    </div>
  );
}
