'use client';

import { RiLockLine, RiMailLine } from '@remixicon/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loginSchema } from '@erp/contracts/core';
import { Button } from '@erp/ui/components/button';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';
import { PasswordInput } from '@erp/ui/components/password-input';
import { sanitizeReturnTo } from '@/lib/return-to';
import { useSession } from '@/lib/session';

function destination(): string {
  return sanitizeReturnTo(new URLSearchParams(window.location.search).get('returnTo')) ?? '/dashboard';
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A person who is already signed in should not be shown the form.
  useEffect(() => {
    if (status === 'authenticated') router.replace(destination());
  }, [status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setError('Enter a valid email address and your password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      router.replace(destination());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col md:flex-row">
      <aside className="relative isolate flex w-full min-w-0 flex-col overflow-hidden bg-[#0E1012] px-6 py-5 text-white md:w-[42%] md:min-w-95 md:p-10">
        <span className="font-heading text-lg font-bold tracking-tight">ERP</span>
        <div className="my-auto hidden max-w-105 md:block">
          <h2 className="font-heading text-[34px] leading-[1.12] font-bold tracking-tighter text-balance">
            One login. Every module.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[14.5px] leading-[1.7] text-white/60">
            You see the parts of the workspace your role allows.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-start justify-center px-5 pt-10 pb-12 md:items-center md:px-7 md:py-10">
        <form onSubmit={onSubmit} className="grid w-full max-w-100 gap-4" noValidate>
          <div>
            <h1 className="font-heading text-[26px] font-bold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground">Sign in to your workspace.</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <RiMailLine className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 pl-9"
                required
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <RiLockLine className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pl-9"
                required
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="h-11" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </main>
    </div>
  );
}
