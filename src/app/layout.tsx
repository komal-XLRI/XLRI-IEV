import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { THEME_BOOT_SCRIPT } from '@/lib/theme/theme';
import { sidebarCollapsed } from '@/lib/ui/persistentFlag';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'IEV Student Activity Tracker · XLRI',
    template: '%s · IEV Tracker · XLRI',
  },
  description:
    'Track student ventures, support activities, submissions and dual faculty/mentor reviews across the three-term IEV programme at XLRI Xavier School of Management.',
  applicationName: 'IEV Activity Tracker',
  // The favicon comes from src/app/icon.svg by convention.
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the default theme rather than the device: this tints the mobile
  // browser chrome, and keying it to `prefers-color-scheme` would put dark
  // chrome above a light page for every visitor on a dark phone who has not
  // chosen dark in the app.
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning`: the boot script below sets `data-theme` and
    // `style.color-scheme` on this element before React hydrates, so the server
    // markup and the live DOM legitimately differ on those two attributes.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the correct palette is the first thing
            painted — otherwise every load would flash light before switching. */}
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOT_SCRIPT + sidebarCollapsed.bootScript,
          }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
