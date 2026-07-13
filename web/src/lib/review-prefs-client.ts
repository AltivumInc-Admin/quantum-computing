// Client for the review-email preferences API (lambda/review-email's /prefs):
// the opt-in switch for "email me when review cards are due", plus the delete
// used by account deletion. Auth is the Cognito ID token — the same verified
// token the sync + QPU authorizers trust; the server takes identity solely
// from that token's sub, so this client never sends a user id. aws-amplify is
// imported lazily inside auth() so this module is import-safe before the auth
// bridge configures Amplify (mirrors qpu-client's contract).

import { isAuthConfigured } from "./auth-config";

export function reviewPrefsUrl(): string | null {
  return process.env.NEXT_PUBLIC_REVIEW_PREFS_URL || null;
}

/** The reminders control stays hidden until the endpoint AND auth are configured. */
export function isReviewPrefsConfigured(): boolean {
  return reviewPrefsUrl() !== null && isAuthConfigured();
}

export class NotSignedInError extends Error {
  constructor() {
    super("not signed in");
    this.name = "NotSignedIn";
  }
}

async function auth(): Promise<string> {
  const { fetchAuthSession } = await import("aws-amplify/auth");
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  if (!token) throw new NotSignedInError();
  return `Bearer ${token}`;
}

async function req(init?: RequestInit): Promise<Response> {
  const base = reviewPrefsUrl();
  if (!base) throw new Error("review prefs not configured");
  const authorization = await auth();
  return fetch(`${base.replace(/\/+$/, "")}/prefs`, {
    ...init,
    headers: { authorization, ...(init?.headers ?? {}) },
  });
}

/** Current consent. The server default (no row) is remindersOn: false — opt-in. */
export async function getReminderPrefs(): Promise<{ remindersOn: boolean }> {
  const res = await req();
  if (!res.ok) throw new Error(`prefs read failed (${res.status})`);
  return (await res.json()) as { remindersOn: boolean };
}

export async function setReminderPrefs(remindersOn: boolean): Promise<{ remindersOn: boolean }> {
  const res = await req({
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ remindersOn }),
  });
  if (!res.ok) throw new Error(`prefs write failed (${res.status})`);
  return (await res.json()) as { remindersOn: boolean };
}

/** Remove the caller's prefs row entirely (account deletion). */
export async function deleteReminderPrefs(): Promise<void> {
  const res = await req({ method: "DELETE" });
  if (!res.ok) throw new Error(`prefs delete failed (${res.status})`);
}
