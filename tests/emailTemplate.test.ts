/**
 * The OTP email as a document.
 *
 * `tests/integration/otpFlow.itest.ts` proves the right code reaches the right
 * person; this proves the message they open is the institutional one — correct
 * branding, the official mark actually attached and actually referenced, and no
 * markup that a mail client will quietly discard.
 */
import { describe, expect, it } from 'vitest';
import { otpEmail, workshopAnnouncementEmail } from '../src/lib/email/templates';
import { LOGO_ASPECT_RATIO } from '../src/lib/branding/logoArt';
import {
  XLRI_LOGO_DISPLAY,
  XLRI_LOGO_PNG_BASE64,
  XLRI_LOGO_RASTER,
} from '../src/lib/email/assets/xlriLogo';

const message = otpEmail({
  to: 'student@xlri.ac.in',
  name: 'Asha Kumar',
  otp: '482913',
  expiresInMinutes: 10,
});

describe('naming', () => {
  it('heads the email "IEV Login OTP"', () => {
    expect(message.html).toMatch(/<h1[^>]*>\s*IEV Login OTP\s*<\/h1>/);
    expect(message.subject).toBe('Your IEV Login OTP');
  });

  it('has dropped "Activity" from the product name everywhere', () => {
    // The system is "IEV" / "IEV Tracker". A single stale "IEV Activity
    // Tracker" in a footer is exactly the kind of thing that survives a
    // rebrand, so both parts are checked rather than the heading alone.
    expect(message.html).not.toMatch(/Activity/i);
    expect(message.text).not.toMatch(/Activity/i);
    expect(message.subject).not.toMatch(/Activity/i);
  });

  it('names the institution in full', () => {
    expect(message.html).toContain('XLRI Xavier School of Management');
    expect(message.text).toContain('XLRI Xavier School of Management');
  });
});

describe('the code', () => {
  it('appears in both parts, so no client is left with a blank message', () => {
    expect(message.html).toContain('482913');
    expect(message.text).toContain('482913');
  });

  it('is never in the subject, which is readable on a locked phone', () => {
    expect(message.subject).not.toContain('482913');
  });

  it('states the expiry and that it is single-use', () => {
    const wording = /This OTP will expire in 10 minutes and can be used only once\./;
    expect(message.html).toMatch(wording);
    expect(message.text).toMatch(wording);
  });

  it('carries the confidentiality warning', () => {
    expect(message.html).toMatch(/Keep your OTP confidential/);
    expect(message.html).toMatch(/never ask you for this OTP over email, phone, or in person/);
    expect(message.text).toMatch(/never ask you for this OTP/);
  });

  it('tells an unexpecting reader to ignore the email', () => {
    expect(message.html).toMatch(/did not request this code/i);
  });
});

describe('the logo', () => {
  const attachment = message.attachments?.[0];

  it('is attached exactly once', () => {
    expect(message.attachments).toHaveLength(1);
    expect(attachment?.contentType).toBe('image/png');
    expect(attachment?.cid).toBeTruthy();
  });

  it('is referenced by the markup it is attached for', () => {
    // A cid that does not match its <img> is a broken image in every client,
    // and nothing else in the build would notice.
    expect(message.html).toContain(`src="cid:${attachment!.cid}"`);
  });

  it('is a real PNG at the size the module claims', () => {
    const bytes = Buffer.from(XLRI_LOGO_PNG_BASE64, 'base64');

    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(XLRI_LOGO_RASTER.width);
    expect(bytes.readUInt32BE(20)).toBe(XLRI_LOGO_RASTER.height);
  });

  it('is not distorted away from the official artwork', () => {
    // The brief on the logo has always been that it is used as supplied. A
    // rasteriser given the wrong box would squash the mark, and it is the kind
    // of thing nobody sees until it is in someone's inbox.
    const rendered = XLRI_LOGO_RASTER.width / XLRI_LOGO_RASTER.height;
    expect(rendered).toBeCloseTo(LOGO_ASPECT_RATIO, 1);
  });

  it('is rendered above the size it is displayed at, so it stays sharp', () => {
    expect(XLRI_LOGO_RASTER.width).toBeGreaterThanOrEqual(XLRI_LOGO_DISPLAY.width * 2);
  });

  it('declares both dimensions, which Outlook requires', () => {
    expect(message.html).toContain(`width="${XLRI_LOGO_DISPLAY.width}"`);
    expect(message.html).toContain(`height="${XLRI_LOGO_DISPLAY.height}"`);
  });

  it('degrades to the institution name when images are blocked', () => {
    expect(message.html).toContain('alt="XLRI Xavier School of Management"');
  });
});

describe('client compatibility', () => {
  it('escapes the recipient name rather than interpolating it raw', () => {
    const hostile = otpEmail({
      to: 'x@y.z',
      name: '<script>alert(1)</script>',
      otp: '000000',
      expiresInMinutes: 10,
    });

    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain('&lt;script&gt;');
  });

  it('carries no external references, which are blocked or proxied', () => {
    // Everything must be self-contained: a remote stylesheet or tracking
    // pixel is stripped by Gmail, and a hosted image needs the app to be
    // publicly reachable before an OTP email renders.
    expect(message.html).not.toMatch(/<link\b/i);
    expect(message.html).not.toMatch(/<script\b/i);
    expect(message.html).not.toMatch(/src="https?:/i);
    expect(message.html).not.toMatch(/src="data:/i);
  });

  it('lays out in tables with inline styles, not in a stylesheet', () => {
    // Outlook renders through Word: no flexbox, no grid, and class-based
    // layout is unreliable. The only <style> present is the mobile override.
    expect(message.html).not.toMatch(/display\s*:\s*(flex|grid)/i);

    const blocks = message.html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/@media only screen/);
  });

  it('holds every layout rule inline as well as in the media query', () => {
    // The media query only narrows what is already set inline, so a client
    // that drops <style> loses the mobile tuning and nothing else.
    const [block] = message.html.match(/<style[\s\S]*?<\/style>/i)!;
    const overridden = [...block.matchAll(/\.([a-z-]+)\s*\{/g)].map((match) => match[1]);

    expect(overridden.length).toBeGreaterThan(0);
    for (const className of overridden) {
      expect(message.html).toContain(`class="${className}"`);
    }
  });

  it('pins itself to a light scheme so clients do not re-tint it', () => {
    expect(message.html).toContain('name="color-scheme" content="light"');
    expect(message.html).toContain('name="supported-color-schemes" content="light"');
  });

  it('is fluid below its fixed width, for a phone', () => {
    expect(message.html).toContain('max-width:560px');
    expect(message.html).toContain('width:100%');
  });
});

/**
 * The workshop announcement.
 *
 * `tests/integration/workshopEmail.itest.ts` proves the send reaches every
 * active student and is recorded; this proves the message they open actually
 * tells them where and when to turn up, and that an administrator's typing
 * cannot become markup on its way there.
 */
describe('workshop announcement', () => {
  const OFFLINE = {
    title: 'Fundraising without a deck',
    description: 'A working session on the first cheque.',
    typeLabel: 'Founder talk',
    dateLabel: '09 Nov 2026',
    startTime: '14:00',
    endTime: '16:30',
    modeLabel: 'Offline',
    venue: 'XLRI Jamshedpur, Auditorium 2',
    hostName: 'R. Menon',
    hostDesignation: 'Programme Chair',
    hostOrganisation: 'XLRI',
    speakerName: 'S. Iyer',
    speakerDesignation: 'Founder',
    speakerOrganisation: 'Northwind',
  };

  const offline = workshopAnnouncementEmail({
    to: 'student@xlri.ac.in',
    name: 'Asha Kumar',
    workshop: OFFLINE,
  });

  const online = workshopAnnouncementEmail({
    to: 'student@xlri.ac.in',
    name: 'Asha Kumar',
    workshop: {
      ...OFFLINE,
      modeLabel: 'Online',
      venue: undefined,
      meetingLink: 'https://meet.example.com/abc',
      registrationLink: 'https://forms.example.com/register',
    },
  });

  it('names the workshop and its date in the subject', () => {
    // The subject is the whole message in a notification preview, so it has to
    // survive on its own — a bare "Workshop announcement" would not.
    expect(offline.subject).toBe('Fundraising without a deck — 09 Nov 2026');
  });

  it('carries the whole invitation in both parts', () => {
    for (const part of [offline.html, offline.text]) {
      expect(part).toContain('Fundraising without a deck');
      expect(part).toContain('Founder talk');
      expect(part).toContain('09 Nov 2026');
      expect(part).toContain('14:00');
      expect(part).toContain('16:30');
      expect(part).toContain('XLRI Jamshedpur, Auditorium 2');
      expect(part).toContain('A working session on the first cheque.');
    }
  });

  it('qualifies the host and speaker with their role and organisation', () => {
    expect(offline.text).toContain('R. Menon (Programme Chair · XLRI)');
    expect(offline.html).toContain('S. Iyer (Founder · Northwind)');
  });

  it('falls back to a bare name when nothing qualifies it', () => {
    const bare = workshopAnnouncementEmail({
      to: 'x@y.z',
      name: 'A',
      workshop: { ...OFFLINE, hostDesignation: undefined, hostOrganisation: undefined },
    });

    expect(bare.text).toContain('Host      : R. Menon\n');
  });

  it('shows the venue for an offline session and the link for an online one', () => {
    // The wrong one of these is worse than neither: a student who reads
    // "Auditorium 2" on an online-only session travels for nothing.
    expect(offline.html).not.toContain('Join link');
    expect(offline.text).not.toContain('Join link');

    expect(online.html).toContain('https://meet.example.com/abc');
    expect(online.html).not.toContain('Auditorium 2');
    expect(online.text).not.toContain('Venue');
  });

  it('offers a registration button only when there is somewhere to register', () => {
    expect(online.html).toContain('Register for this session');
    expect(online.text).toContain('Register here: https://forms.example.com/register');
    expect(offline.html).not.toContain('Register for this session');
  });

  it('omits an optional description rather than leaving an empty paragraph', () => {
    const terse = workshopAnnouncementEmail({
      to: 'x@y.z',
      name: 'A',
      workshop: { ...OFFLINE, description: undefined },
    });

    expect(terse.html).not.toMatch(/white-space:pre-line/);
    expect(terse.html).toContain('Fundraising without a deck');
  });

  it('escapes everything an administrator typed', () => {
    const hostile = workshopAnnouncementEmail({
      to: 'x@y.z',
      name: '<script>alert(1)</script>',
      workshop: {
        ...OFFLINE,
        title: '<img src=x onerror=alert(1)>',
        venue: '"><b>bold</b>',
      },
    });

    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).not.toContain('<img src=x');
    expect(hostile.html).not.toContain('"><b>bold</b>');
    expect(hostile.html).toContain('&lt;script&gt;');
  });

  it('refuses to render a link it would not follow', () => {
    // These fields are validated on the way in, but a workshop can also arrive
    // from a seed or an import, and an href is where a javascript: string
    // would still mean something.
    const hostile = workshopAnnouncementEmail({
      to: 'x@y.z',
      name: 'A',
      workshop: {
        ...OFFLINE,
        meetingLink: 'javascript:alert(1)',
        registrationLink: 'javascript:alert(1)',
      },
    });

    expect(hostile.html).not.toMatch(/href="javascript:/i);
    expect(hostile.text).not.toContain('javascript:');
    expect(hostile.html).not.toContain('Register for this session');
  });

  it('is built from the same institutional shell as the OTP email', () => {
    expect(offline.html).toContain('XLRI Xavier School of Management');
    expect(offline.html).toContain(`src="cid:${offline.attachments![0].cid}"`);
    expect(offline.html).toContain('max-width:560px');
  });

  it('holds to the same client-compatibility rules', () => {
    expect(offline.html).not.toMatch(/display\s*:\s*(flex|grid)/i);
    expect(offline.html).not.toMatch(/<script\b/i);
    expect(offline.html).not.toMatch(/<link\b/i);
    expect(offline.html).not.toMatch(/src="https?:/i);

    const blocks = offline.html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
    expect(blocks).toHaveLength(1);

    const overridden = [...blocks[0]!.matchAll(/\.([a-z-]+)\s*\{/g)].map((match) => match[1]);
    expect(overridden.length).toBeGreaterThan(0);
    for (const className of overridden) {
      expect(offline.html).toContain(`class="${className}"`);
    }
  });
});
