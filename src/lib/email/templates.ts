import { XLRI_LOGO_DISPLAY, XLRI_LOGO_PNG_BASE64 } from './assets/xlriLogo';
import type { EmailAttachment, EmailMessage } from './provider';

/**
 * Email templates.
 *
 * Written as inline-styled tables rather than with the application's own CSS:
 * mail clients strip <style> blocks, ignore custom properties, and Outlook
 * renders through Word. So the theme tokens deliberately do not reach here —
 * these are fixed brand colours, and the palette is the one place the two
 * systems are allowed to diverge.
 *
 * The <style> block that is here carries only the mobile refinements. Every
 * rule in it is a narrowing of something already set inline, so a client that
 * drops the block renders the desktop layout rather than an unstyled page.
 */

const BRAND = {
  navy: '#013e89',
  lime: '#96a612',
  ink: '#16181d',
  muted: '#4a5057',
  line: '#d5d7da',
  panel: '#f4f6f8',
  /** The tint behind the code — the brand navy at a fraction of its strength. */
  otpPanel: '#eef3fb',
  otpBorder: '#c3d6ef',
} as const;

/** Referenced from the markup as `cid:`. Kept in one place so the two agree. */
const LOGO_CID = 'xlri-logo';

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_STACK = "'SF Mono',Menlo,Consolas,'Courier New',monospace";

const logoAttachment: EmailAttachment = {
  filename: 'xlri-logo.png',
  content: XLRI_LOGO_PNG_BASE64,
  contentType: 'image/png',
  cid: LOGO_CID,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function otpEmail(params: {
  to: string;
  name: string;
  otp: string;
  expiresInMinutes: number;
}): EmailMessage {
  const { to, name, otp, expiresInMinutes } = params;
  const safeName = escapeHtml(name);
  const safeOtp = escapeHtml(otp);

  const text = [
    'XLRI Xavier School of Management',
    'IEV Tracker',
    '',
    'IEV LOGIN OTP',
    '',
    `Hello ${name},`,
    '',
    'Use this one-time password to sign in to the IEV Tracker:',
    '',
    `    ${otp}`,
    '',
    `This OTP will expire in ${expiresInMinutes} minutes and can be used only once.`,
    '',
    'Keep your OTP confidential. XLRI will never ask you for this OTP over',
    'email, phone, or in person. If you did not request this code, please',
    'ignore this email. Do not share it with anyone.',
    '',
    '---',
    'XLRI Xavier School of Management',
    'C. H. Area (East), Jamshedpur, Jharkhand 831001, India',
    'This is an automated message. Please do not reply.',
  ].join('\n');

  // 560px with a fluid width below it: comfortably inside Outlook's safe width,
  // and full-bleed on a phone.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Both, and both light: the pair is what stops Outlook.com and Apple Mail
         from re-tinting a deliberately white institutional layout. -->
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>IEV Login OTP</title>
    <style>
      @media only screen and (max-width: 600px) {
        .sm-px { padding-left: 22px !important; padding-right: 22px !important; }
        .sm-code { font-size: 30px !important; letter-spacing: 7px !important; text-indent: 7px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.panel};-webkit-font-smoothing:antialiased;">
    <!-- Shown in the inbox preview line, then hidden in the body. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Your one-time password expires in ${expiresInMinutes} minutes.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${BRAND.panel};">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
                 style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;font-family:${FONT_STACK};">

            <!-- Masthead: the official mark, centred, on its own white field. -->
            <tr>
              <td align="center" class="sm-px" style="padding:32px 40px 24px;">
                <img src="cid:${LOGO_CID}"
                     width="${XLRI_LOGO_DISPLAY.width}" height="${XLRI_LOGO_DISPLAY.height}"
                     alt="XLRI Xavier School of Management"
                     style="display:block;border:0;outline:none;text-decoration:none;width:${XLRI_LOGO_DISPLAY.width}px;height:${XLRI_LOGO_DISPLAY.height}px;max-width:100%;color:${BRAND.navy};font-family:${FONT_STACK};font-size:15px;font-weight:700;" />
              </td>
            </tr>

            <!-- A single brand rule, navy led by a short lime stroke. Two cells,
                 so it survives clients that drop borders and backgrounds. -->
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="72" height="3" style="width:72px;height:3px;background:${BRAND.lime};font-size:0;line-height:0;">&nbsp;</td>
                    <td height="3" style="height:3px;background:${BRAND.navy};font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="sm-px" style="padding:32px 40px 0;">
                <h1 style="margin:0 0 20px;font-size:20px;line-height:28px;font-weight:600;color:${BRAND.navy};letter-spacing:-0.01em;">
                  IEV Login OTP
                </h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:23px;color:${BRAND.ink};">
                  Hello ${safeName},
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:${BRAND.muted};">
                  Use the one-time password below to sign in to the IEV Tracker.
                </p>
              </td>
            </tr>

            <tr>
              <td class="sm-px" style="padding:0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="background:${BRAND.otpPanel};border:1px solid ${BRAND.otpBorder};border-radius:10px;">
                  <tr>
                    <td align="center" style="padding:26px 16px 22px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};padding-bottom:14px;">
                        One-time password
                      </div>
                      <!-- text-indent cancels the trailing letter-space, which
                           would otherwise push the digits off centre. -->
                      <div class="sm-code" style="font-family:${MONO_STACK};font-size:36px;line-height:44px;font-weight:700;letter-spacing:10px;text-indent:10px;color:${BRAND.navy};">
                        ${safeOtp}
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:12px 0 0;font-size:13px;line-height:20px;color:${BRAND.muted};text-align:center;">
                  This OTP will expire in ${expiresInMinutes} minutes and can be used only once.
                </p>
              </td>
            </tr>

            <tr>
              <td class="sm-px" style="padding:28px 40px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="border-top:1px solid ${BRAND.line};">
                  <tr>
                    <td style="padding-top:22px;">
                      <p style="margin:0;font-size:14px;line-height:22px;color:${BRAND.muted};">
                        <strong style="color:${BRAND.ink};">Keep your OTP confidential.</strong>
                        XLRI will never ask you for this OTP over email, phone, or in person.
                        If you did not request this code, please ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="sm-px" style="padding:20px 40px 24px;background:${BRAND.panel};border-top:1px solid ${BRAND.line};">
                <div style="font-size:12px;line-height:19px;color:${BRAND.muted};">
                  <strong style="color:${BRAND.ink};font-weight:600;">XLRI Xavier School of Management</strong><br />
                  C. H. Area (East), Jamshedpur, Jharkhand 831001, India<br />
                  <span style="color:#6b7178;">This is an automated message. Please do not reply.</span>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    to,
    // The code is deliberately not in the subject: subjects show on lock
    // screens and in notification previews, where a one-time password should
    // not be readable without unlocking the device.
    subject: 'Your IEV Login OTP',
    html,
    text,
    attachments: [logoAttachment],
  };
}
