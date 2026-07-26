// Client for the quantum-qpu-submit API — the ONLY path that spends the learner's
// sponsored budget on a REAL hardware run. Auth is the Cognito ID token (the same
// verified token the sync + API authorizer trust). aws-amplify is imported lazily
// inside session() so this module is import-safe before the auth bridge configures
// Amplify (mirrors sync-client's dynamic-load contract). Every server response is
// authoritative — the client only previews cost and shows what the server returns.

import { isAuthConfigured } from "./auth-config";

export function qpuUrl(): string | null {
  return process.env.NEXT_PUBLIC_QPU_URL || null;
}

/** The whole QPU surface stays dark until the endpoint AND auth are configured. */
export function isQpuConfigured(): boolean {
  return qpuUrl() !== null && isAuthConfigured();
}

export class NotSignedInError extends Error {
  constructor() {
    super("not signed in");
    this.name = "NotSignedIn";
  }
}

/**
 * A non-ok response from a QPU endpoint, carrying the STATUS the caller needs.
 *
 * The message text is unchanged from the plain `new Error("budget failed (429)")`
 * this replaces — what changes is that the number survives as a field instead of
 * only as digits inside a sentence no branch could read. Every caller treated a
 * throttle exactly like a dead service, so the edge's new 429 (lambda/qpu/edge.yaml)
 * reached the learner as "Couldn't reach the hardware service" — an outage claim for
 * a wait-a-minute condition.
 */
export class QpuHttpError extends Error {
  readonly status: number;
  constructor(what: string, status: number) {
    super(`${what} failed (${status})`);
    this.name = "QpuHttpError";
    this.status = status;
  }
}

/**
 * Is this failure the edge rate limit?
 *
 * Keyed on STATUS — and deliberately NOT on 403, which is where this differs from
 * ask-tutor's transportErrorMessage. On the tutor path the WAF limit is the only
 * realistic cause of either code, so the two share one sentence. Here 403 is
 * genuinely ambiguous: qpu-core.mjs answers an edge-secret mismatch with 403, and a
 * misconfigured origin must keep reading as a fault, not as "wait a minute". That
 * ambiguity is the entire reason edge.yaml was changed to return 429 in the first
 * place.
 *
 * Consequence, stated plainly: until that distribution ships, a throttled request
 * still arrives as WAF's default 403 with a non-JSON body and falls through to the
 * generic message. This under-claims before the deploy rather than mis-claiming
 * after it.
 */
export function isRateLimited(e: unknown): boolean {
  return e instanceof QpuHttpError && e.status === 429;
}

/**
 * The same verdict for a RESOLVED submit, which returns its status instead of
 * throwing it. Both halves matter: `status === 429` is what a deployed edge sends,
 * and `error === "rate_limited"` is the JSON token in its body — keying on the token
 * alone would be dead code today, because the undeployed state yields a non-JSON 403
 * whose `error` becomes the synthesised "submit failed (403)".
 */
export function isRateLimitedOutcome(status: number, error: string): boolean {
  return status === 429 || error === "rate_limited";
}

/**
 * Why a THROWN submit happened, as far as the browser can tell. This is a
 * connection-vs-service distinction, not a truth verdict — a dropped wifi link
 * can kill the request before OR after it reached the server, so the caller
 * still resolves the actual outcome against the run history. First live user
 * report (2026-07-15): wifi dropped mid-submit and the generic message read
 * like a software failure.
 *
 * `navigator.onLine === false` is trustworthy only in that direction: false
 * means definitely offline; true means merely "not provably offline". A fetch
 * network failure surfaces as TypeError in every browser.
 */
export type SubmitFailureKind = "offline" | "network" | "unknown";

export function classifySubmitFailure(e: unknown): SubmitFailureKind {
  if (e instanceof NotSignedInError) return "unknown"; // callers branch on sign-in first
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  } catch {
    /* navigator unavailable — fall through */
  }
  if (e instanceof TypeError) return "network";
  return "unknown";
}

export interface QpuTask {
  idempotencyKey: string;
  device: string;
  shots: number;
  estMicros: number;
  status: string;
  taskArn: string | null;
  circuitHash: string | null;
  createdAt: number;
}

export interface Budget {
  capMicros: number;
  spentMicros: number;
  remainingMicros: number;
  credentialed: boolean;
  /**
   * COMPLETED runs, a monotonic SERVER aggregate (not derived from `tasks`).
   * `tasks` is truncated to the newest 50 rows, and refunded FAILED/RELEASED rows
   * still occupy slots in that window — so counting COMPLETED rows there lets a
   * busy learner's earned medal silently UN-EARN. These counters can't.
   *
   * `null` means the SERVER DID NOT REPORT IT — not zero. A Lambda deployed before
   * the medal counters existed omits both fields, and the client is not entitled to
   * invent a value for them: a learner with two real runs told "0 of 1 run" is being
   * lied to just as surely as one told "NaN". Unknown stays unknown all the way to
   * the UI, which renders it as `unverified` — the state the wall already has.
   */
  completedRuns: number | null;
  /** Total shots across COMPLETED runs — what the "Deep sample" medal reads. `null`
   *  when the server did not report it (see completedRuns). */
  completedShots: number | null;
  tasks: QpuTask[];
}

export interface CredentialChallenge {
  credentialed: boolean;
  requiredShots: number;
  requiredTasks: number;
  device: string;
}

export type SubmitOutcome =
  | { ok: true; duplicate?: boolean; taskArn: string | null; estMicros: number; circuitHash?: string }
  | { ok: false; status: number; error: string };

async function auth(): Promise<string> {
  const { fetchAuthSession } = await import("aws-amplify/auth");
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  if (!token) throw new NotSignedInError();
  return `Bearer ${token}`;
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  const base = qpuUrl();
  if (!base) throw new Error("qpu not configured");
  // Strip a trailing slash so a base like ".../" + "/qpu/budget" doesn't become
  // "...//qpu/budget" (works, but not pristine — the env var may or may not end in /).
  const authorization = await auth();
  return fetch(`${base.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { authorization, ...(init?.headers ?? {}) },
  });
}

/**
 * A non-negative finite number, or null. THE BUG THIS EXISTS TO KILL:
 *
 * The deployed Lambda predated the medal counters and returned a budget with NO
 * completedRuns/completedShots. TypeScript said `number`; the runtime said
 * `undefined`. So `Math.min(undefined, 1).toLocaleString()` rendered the literal
 * string "NaN" — "NaN of 1 run" shipped to production — and, far worse,
 * `tierReachable()` computed `undefined + 596 >= 1000` → `NaN >= 1000` → false,
 * which the UI reads as FORECLOSED. A missing field was silently converting into
 * the claim "this medal is out of reach forever." The budget's own money fields
 * were fine; one absent counter poisoned the arithmetic downstream of them.
 *
 * A `Budget` is now honest by construction: an absent or malformed counter is
 * `null`, the type makes every consumer say what it does about that, and nothing
 * on any surface can do arithmetic on an unknown.
 */
function counter(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
}

/** The money fields, by contrast, are NOT optional: a budget that cannot state its
 *  own remaining balance is unusable, and coercing it would print "$NaN". Reject it
 *  and let the caller's existing error state ("Couldn't reach the hardware service")
 *  do its job — a surface that admits it is broken beats one that renders nonsense. */
function money(x: unknown): number {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("budget malformed");
  return x;
}

export async function getBudget(): Promise<Budget> {
  const res = await req("/qpu/budget");
  if (!res.ok) throw new QpuHttpError("budget", res.status);
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    capMicros: money(raw.capMicros),
    spentMicros: money(raw.spentMicros),
    remainingMicros: money(raw.remainingMicros),
    credentialed: raw.credentialed === true,
    completedRuns: counter(raw.completedRuns),
    completedShots: counter(raw.completedShots),
    tasks: Array.isArray(raw.tasks) ? (raw.tasks as QpuTask[]) : [],
  };
}

export async function getCredentialChallenge(): Promise<CredentialChallenge> {
  const res = await req("/qpu/credential");
  if (!res.ok) throw new QpuHttpError("credential status", res.status);
  return (await res.json()) as CredentialChallenge;
}

/** Submit a cost estimate (in cents) to earn the credential. */
export async function claimCredential(answerCents: number): Promise<{ credentialed: boolean }> {
  const res = await req("/qpu/credential", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answerCents }),
  });
  if (!res.ok) throw new QpuHttpError("credential claim", res.status);
  return (await res.json()) as { credentialed: boolean };
}

/**
 * Submit a circuit to real hardware. The idempotencyKey belongs to the INTENT
 * (the caller mints it once and reuses it across retries of the same run), so a
 * retried submit dedupes on the server instead of double-charging.
 */
export async function submitTask(
  shots: number,
  qasm: string,
  idempotencyKey: string,
): Promise<SubmitOutcome> {
  const res = await req("/qpu/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device: "iqm_garnet", shots, qasm, idempotencyKey }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const task = body.task as { taskArn?: string; estMicros?: number; circuitHash?: string } | undefined;
  if (res.status === 202 || (res.status === 200 && body.duplicate)) {
    return {
      ok: true,
      duplicate: res.status === 200,
      taskArn: (body.taskArn ?? task?.taskArn ?? null) as string | null,
      estMicros: (body.estMicros ?? task?.estMicros ?? 0) as number,
      circuitHash: (body.circuitHash ?? task?.circuitHash) as string | undefined,
    };
  }
  return { ok: false, status: res.status, error: String(body.error ?? `submit failed (${res.status})`) };
}
