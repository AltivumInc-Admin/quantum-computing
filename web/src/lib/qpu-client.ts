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
  const authorization = await auth();
  return fetch(`${base}${path}`, {
    ...init,
    headers: { authorization, ...(init?.headers ?? {}) },
  });
}

export async function getBudget(): Promise<Budget> {
  const res = await req("/qpu/budget");
  if (!res.ok) throw new Error(`budget failed (${res.status})`);
  return (await res.json()) as Budget;
}

export async function getCredentialChallenge(): Promise<CredentialChallenge> {
  const res = await req("/qpu/credential");
  if (!res.ok) throw new Error(`credential status failed (${res.status})`);
  return (await res.json()) as CredentialChallenge;
}

/** Submit a cost estimate (in cents) to earn the credential. */
export async function claimCredential(answerCents: number): Promise<{ credentialed: boolean }> {
  const res = await req("/qpu/credential", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answerCents }),
  });
  if (!res.ok) throw new Error(`credential claim failed (${res.status})`);
  return (await res.json()) as { credentialed: boolean };
}

/** Submit a circuit to real hardware. A fresh idempotency key per attempt. */
export async function submitTask(shots: number, qasm: string): Promise<SubmitOutcome> {
  const res = await req("/qpu/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device: "iqm_garnet", shots, qasm, idempotencyKey: crypto.randomUUID() }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 202 || (res.status === 200 && body.duplicate)) {
    return {
      ok: true,
      duplicate: res.status === 200,
      taskArn: (body.taskArn ?? (body.task as { taskArn?: string })?.taskArn ?? null) as string | null,
      estMicros: (body.estMicros ?? (body.task as { estMicros?: number })?.estMicros ?? 0) as number,
      circuitHash: body.circuitHash as string | undefined,
    };
  }
  return { ok: false, status: res.status, error: String(body.error ?? `submit failed (${res.status})`) };
}
