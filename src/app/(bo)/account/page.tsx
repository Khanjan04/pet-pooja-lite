"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Dialog } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { useMe } from "@/components/shell/bo-guard";
import { authClient, authMessage } from "@/lib/auth-client";

export default function AccountPage() {
  const me = useMe();
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 lg:p-8">
      <h1 className="text-xl">Your account</h1>
      <p className="text-text-muted">{me?.name} · {me?.email} · {me?.role} of {me?.org.name}</p>
      <section className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={async () => { await authClient.signOut(); router.replace("/login"); }}>Sign out</Button>
        <Button variant="secondary" onClick={async () => {
          const { error } = await authClient.revokeSessions();
          setMsg(error ? { kind: "danger", text: authMessage(error, "Couldn’t sign out other devices.") } : { kind: "success", text: "Signed out everywhere." });
          if (!error) router.replace("/login");
        }}>Sign out everywhere</Button>
      </section>
      {msg && <Alert kind={msg.kind} title={msg.text} />}
      <section aria-labelledby="del-h" className="rounded-lg border border-danger p-4">
        <h2 id="del-h" className="text-lg">Delete account</h2>
        <p className="mt-1 text-sm text-text-muted">
          Removes your login straight away. If you’re the only owner, the restaurant is closed, its tills stop, the subscription is cancelled and customers’ personal
          details are erased. Bills are kept for the 72 months GST law requires, then deleted.
        </p>
        <Button className="mt-3" variant="danger" onClick={() => setDeleting(true)}>Delete my account</Button>
      </section>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete your account?"
        description="This can’t be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>Keep account</Button>
            <Button variant="danger" loading={busy} disabled={!password} onClick={async () => {
              setBusy(true);
              const { error } = await authClient.deleteUser({ password });
              setBusy(false);
              if (error) setMsg({ kind: "danger", text: authMessage(error, "Couldn’t delete the account.") });
              else router.replace("/login");
              setDeleting(false);
            }}>Delete for good</Button>
          </>
        }
      >
        <Field label="Your password, to confirm" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Dialog>
    </div>
  );
}
