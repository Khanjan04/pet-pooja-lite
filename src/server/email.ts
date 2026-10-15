import "server-only";
import { Resend } from "resend";
import { env, isProd } from "./env";
import { enqueue, registerJob, runJobNow } from "./jobs";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Queue an email and try to send it right away; the job runner retries failures with backoff. */
export async function sendEmail(e: Email) {
  const id = await enqueue("email.send", e);
  await runJobNow(id);
}

registerJob<Email>("email.send", async (e) => {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    // Development: no provider. The message stays in jobs.payload so you (and the tests) can read the link.
    console.info(`[dev email] kept in jobs table: "${e.subject}"`); // no address in logs
    return { keepPayload: true };
  }
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: EMAIL_FROM, to: e.to, subject: e.subject, html: e.html, text: e.text });
  if (error) throw new Error(`resend: ${error.name}: ${error.message}`);
  return { keepPayload: !isProd() };
});

/* ---------- templates (our own words) ---------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#2f55d4;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>
       <p style="color:#5a6270;font-size:13px">Or paste this link into your browser:<br>${esc(cta.url)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#14171c;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${esc(title)}</h1>${body}${button}
<p style="color:#5a6270;font-size:12px;margin-top:32px">You’re getting this because of an action on your restaurant account. If it wasn’t you, ignore this email.</p>
</body></html>`;
}

export function verifyEmailMessage(to: string, name: string, url: string): Email {
  return {
    to,
    subject: "Confirm your email to finish setting up",
    html: layout(`Welcome, ${name}`, `<p>Confirm this email address and we’ll take you straight to setting up your restaurant.</p>`, { label: "Confirm email", url }),
    text: `Welcome, ${name}.\n\nConfirm your email to finish setting up:\n${url}\n\nThe link works for 24 hours.`,
  };
}

export function resetPasswordMessage(to: string, url: string): Email {
  return {
    to,
    subject: "Reset your password",
    html: layout("Reset your password", `<p>Someone (hopefully you) asked to reset the password for this account. The link works for one hour.</p>`, { label: "Choose a new password", url }),
    text: `Reset your password (link works for one hour):\n${url}\n\nIf you didn’t ask for this, ignore this email.`,
  };
}

export function paymentFailedMessage(to: string, orgName: string, url: string): Email {
  return {
    to,
    subject: `Payment didn’t go through for ${orgName}`,
    html: layout("Your subscription payment failed", `<p>We couldn’t charge your payment method for <b>${esc(orgName)}</b>. Your tills keep working; please update your payment within 7 days to keep the back office open.</p>`, { label: "Review billing", url }),
    text: `We couldn’t charge your payment method for ${orgName}. Your tills keep working. Review billing: ${url}`,
  };
}
