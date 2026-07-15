// The one-shot handoff from the playground to the /workspace hardware panel:
// the playground compiles qsim to OpenQASM, writes it here, and routes to
// /workspace#hardware; the submit panel consumes it as its editor's initial
// value. sessionStorage on purpose — the handoff is a single in-tab gesture,
// dies with the tab, and never enters the synced qc:* namespace. It also
// SURVIVES the credential-pricing detour: a first-time learner lands on the
// pricing challenge, earns the credential, and the form still finds the
// circuit waiting when it finally mounts (consume happens at form mount, not
// panel mount).

import { QASM_SUBMIT_BYTE_CAP } from "./compile-qasm";
import { utf8ByteLength } from "./utf8";

export type Handoff = { qasm: string; name?: string; ts: number };

const KEY = "qcp:handoff:v1"; // outside qc:* — never synced, never merged
const MAX_NAME = 80;

export function writeHandoff(h: { qasm: string; name?: string }): boolean {
  try {
    if (h.qasm.trim().length === 0 || utf8ByteLength(h.qasm) > QASM_SUBMIT_BYTE_CAP) return false;
    const name = h.name?.trim().slice(0, MAX_NAME);
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, qasm: h.qasm, ...(name ? { name } : {}), ts: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

function readValid(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      o.v !== 1 ||
      typeof o.qasm !== "string" ||
      o.qasm.trim().length === 0 ||
      utf8ByteLength(o.qasm) > QASM_SUBMIT_BYTE_CAP ||
      typeof o.ts !== "number" ||
      !Number.isFinite(o.ts)
    ) {
      return null;
    }
    const name = typeof o.name === "string" && o.name.length > 0 ? o.name : undefined;
    return name !== undefined ? { qasm: o.qasm, name, ts: o.ts } : { qasm: o.qasm, ts: o.ts };
  } catch {
    return null;
  }
}

export function peekHandoff(): Handoff | null {
  return readValid();
}

/** Read and clear — clears even an invalid/corrupt value so garbage never lingers. */
export function consumeHandoff(): Handoff | null {
  const h = readValid();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  return h;
}
