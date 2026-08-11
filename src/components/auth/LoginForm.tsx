'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { FormMessage } from '@/components/ui/FormMessage';
import { OtpInput } from '@/components/ui/OtpInput';
import { OTP_LENGTH } from '@/lib/auth/otp';

type Stage = 'EMAIL' | 'OTP';

/** m:ss, so a ten-minute window reads as a clock rather than "584 seconds". */
function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

interface ApiError {
  error?: { message?: string };
}

export function LoginForm() {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  // One timer drives both counters, so they cannot drift apart on screen.
  useEffect(() => {
    if (cooldown <= 0 && expiresIn <= 0) return;

    const timer = setTimeout(() => {
      setCooldown((value) => Math.max(0, value - 1));
      setExpiresIn((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldown, expiresIn]);

  const expired = stage === 'OTP' && expiresIn === 0;

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const body = (await response.json()) as ApiError & {
        cooldownSeconds?: number;
        expiresInSeconds?: number;
      };

      if (!response.ok) {
        setError(body.error?.message ?? 'Could not send the code. Please try again.');
        return;
      }

      setStage('OTP');
      setOtp('');
      setCooldown(body.cooldownSeconds ?? 60);
      // The server is the authority on the lifetime; this only mirrors it.
      setExpiresIn(body.expiresInSeconds ?? 600);
      // Deliberately generic: the response is identical whether or not the
      // address belongs to a real account.
      setNotice(`If that address is registered, a ${OTP_LENGTH}-digit code is on its way.`);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const body = (await response.json()) as ApiError & { redirectTo?: string };

      if (!response.ok) {
        setError(body.error?.message ?? 'Invalid or expired code');
        return;
      }

      router.replace(body.redirectTo ?? '/');
      router.refresh();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'EMAIL') {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <Field label="Email address" htmlFor="email" required>
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@programme.edu"
          />
        </Field>

        <Button type="submit" disabled={busy || email.length === 0} className="w-full">
          {busy ? 'Sending…' : 'Send code'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="space-y-4">
      {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {expired ? (
        <FormMessage tone="warning">
          That code has expired. Request a new one to continue.
        </FormMessage>
      ) : null}

      <Field
        label={`${OTP_LENGTH}-digit code`}
        htmlFor="otp"
        hint={
          expired
            ? `Sent to ${email} · expired`
            : `Sent to ${email} · expires in ${formatCountdown(expiresIn)}`
        }
        required
      >
        <OtpInput
          id="otp"
          value={otp}
          onChange={setOtp}
          length={OTP_LENGTH}
          disabled={expired}
          // The server does not say which of "wrong", "expired" or "unknown"
          // it was, so the boxes only go red when there is a message to go
          // with them.
          invalid={error !== null}
          autoFocus
          label={`${OTP_LENGTH}-digit sign-in code`}
        />
      </Field>

      <Button
        type="submit"
        disabled={busy || expired || otp.length !== OTP_LENGTH}
        className="w-full"
      >
        {busy ? 'Verifying…' : 'Verify and sign in'}
      </Button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:underline"
          onClick={() => {
            setStage('EMAIL');
            setOtp('');
            setError(null);
            setNotice(null);
          }}
        >
          Use a different email
        </button>

        <button
          type="button"
          className="text-primary disabled:text-muted-foreground hover:underline disabled:hover:no-underline"
          disabled={cooldown > 0 || busy}
          onClick={() => requestCode()}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}
