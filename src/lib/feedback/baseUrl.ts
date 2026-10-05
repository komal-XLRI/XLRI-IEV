import 'server-only';
import { headers } from 'next/headers';
import { env } from '@/config/env';

/**
 * The origin printed inside QR codes. `APP_URL` wins — behind a proxy the
 * request's own host can be an internal name a phone cannot reach. Without it
 * the current request's host is used, which is right for local development.
 */
export async function publicBaseUrl(): Promise<string> {
  const configured = env().APP_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
