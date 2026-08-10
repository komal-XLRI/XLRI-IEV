import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <div className="mb-6">
        <p className="text-primary text-[11px] font-semibold tracking-[0.18em] uppercase">
          IEV Programme
        </p>
        <h1 className="mt-1 text-xl font-semibold">Sign in to the Activity Tracker</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Enter your programme email address and we will send you a one-time code.
        </p>
      </div>
      <LoginForm />
    </>
  );
}
