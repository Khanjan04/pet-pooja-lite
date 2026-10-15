"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { authClient, authMessage } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount
    setToken(q.get("error") ? null : q.get("token"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) setError(authMessage(error, "Couldn’t change the password."));
    else setDone(true);
  }

  const card = "flex w-full max-w-md flex-col gap-4 rounded-lg bg-bg p-6 shadow-card sm:p-8";
  if (token === undefined) return <div aria-busy className={card} />;
  if (token === null)
    return (
      <div className={card}>
        <h1 className="text-xl">This link has expired</h1>
        <p className="text-text-muted">Reset links work once, for one hour. Ask for a new one.</p>
        <Link className="font-semibold text-accent underline" href="/login">Back to sign in</Link>
      </div>
    );
  if (done)
    return (
      <div className={card}>
        <h1 className="text-xl">Password changed</h1>
        <p className="text-text-muted">You’ve been signed out on every device. Sign in with the new password.</p>
        <Link className="font-semibold text-accent underline" href="/login">Sign in</Link>
      </div>
    );
  return (
    <form onSubmit={submit} className={card}>
      <h1 className="text-xl">Choose a new password</h1>
      <Field label="New password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Alert kind="danger" title={error} />}
      <Button type="submit" size="lg" loading={busy}>Save password</Button>
    </form>
  );
}
