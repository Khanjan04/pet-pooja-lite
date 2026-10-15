"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { Segmented } from "@/components/ui/pos";
import { authClient, authMessage } from "@/lib/auth-client";

type Mode = "signin" | "signup" | "forgot";

// S01: owners and managers. Floor staff use PINs on a paired till instead.
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "verify" | "reset">(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({ name, email, password, callbackURL: "/onboarding" });
        if (error) return setError(authMessage(error, "Couldn’t create the account."));
        setSent("verify");
      } else if (mode === "signin") {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
        if (error) {
          if (error.code === "EMAIL_NOT_VERIFIED") await authClient.sendVerificationEmail({ email, callbackURL: "/onboarding" });
          return setError(authMessage(error, "Couldn’t sign in."));
        }
        router.replace("/dashboard");
      } else {
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setSent("reset"); // same answer whether or not the email exists
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg bg-bg p-8 text-center shadow-card">
        <MailCheck aria-hidden className="size-12 text-success" />
        <h1 className="text-xl">Check your email</h1>
        <p className="text-text-muted">
          {sent === "verify"
            ? `We sent a link to ${email}. Open it to confirm your address and set up your restaurant.`
            : `If ${email} has an account, a reset link is on its way. It works for one hour.`}
        </p>
        <Button variant="ghost" onClick={() => { setSent(null); setMode("signin"); }}>
          Back to sign in
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate={false} className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-bg p-6 shadow-card sm:p-8">
      <div>
        <h1 className="text-xl">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in"}</h1>
        <p className="text-sm text-text-muted">For restaurant owners and managers. Staff log in on the till with their PIN.</p>
      </div>
      {mode !== "forgot" && (
        <Segmented
          label="Account"
          value={mode}
          onChange={(m) => { setMode(m); setError(null); }}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "New account" },
          ]}
        />
      )}
      {mode === "signup" && <Field label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode !== "forgot" && (
        <Field
          label="Password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 10 : undefined}
          hint={mode === "signup" ? "At least 10 characters." : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
      {error && <Alert kind="danger" title={error} />}
      <Button type="submit" size="lg" loading={busy}>
        {mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
      </Button>
      {mode === "signin" && (
        <button type="button" className="self-center text-sm font-semibold text-accent underline" onClick={() => { setMode("forgot"); setError(null); }}>
          Forgot your password?
        </button>
      )}
      {mode === "forgot" && (
        <button type="button" className="self-center text-sm font-semibold text-accent underline" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      )}
    </form>
  );
}
