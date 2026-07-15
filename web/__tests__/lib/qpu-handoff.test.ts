/**
 * @jest-environment jsdom
 */
import { QASM_SUBMIT_BYTE_CAP } from "@/lib/compile-qasm";
import { consumeHandoff, peekHandoff, writeHandoff } from "@/lib/qpu-handoff";

const KEY = "qcp:handoff:v1";
const QASM = "OPENQASM 3.0;\nqubit[2] q;\nh q[0];\ncnot q[0], q[1];\nbit[2] c;\nc = measure q;";

beforeEach(() => sessionStorage.clear());

describe("write / peek / consume round-trip", () => {
  it("round-trips qasm + name with a finite timestamp", () => {
    expect(writeHandoff({ qasm: QASM, name: "Bell pair" })).toBe(true);
    const h = peekHandoff();
    expect(h).toMatchObject({ qasm: QASM, name: "Bell pair" });
    expect(typeof h!.ts).toBe("number");
    expect(Number.isFinite(h!.ts)).toBe(true);
  });

  it("stores OUTSIDE the synced qc:* namespace, in sessionStorage", () => {
    writeHandoff({ qasm: QASM });
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(KEY.startsWith("qc:")).toBe(false);
  });

  it("peek does not clear; consume returns then clears; second consume is null", () => {
    writeHandoff({ qasm: QASM, name: "Bell" });
    expect(peekHandoff()).not.toBeNull();
    expect(peekHandoff()).not.toBeNull(); // peek is repeatable
    expect(consumeHandoff()).toMatchObject({ qasm: QASM, name: "Bell" });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(consumeHandoff()).toBeNull();
    expect(peekHandoff()).toBeNull();
  });

  it("a nameless handoff comes back without a name key", () => {
    writeHandoff({ qasm: QASM });
    const h = consumeHandoff();
    expect(h).not.toBeNull();
    expect(h).not.toHaveProperty("name");
  });
});

describe("write refusals", () => {
  it("refuses empty and whitespace-only qasm", () => {
    expect(writeHandoff({ qasm: "" })).toBe(false);
    expect(writeHandoff({ qasm: "   \n\t " })).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("refuses qasm over the submit byte cap (UTF-8 bytes, not chars)", () => {
    expect(writeHandoff({ qasm: "x".repeat(QASM_SUBMIT_BYTE_CAP + 1) })).toBe(false);
    // 3,000 CJK chars = 9,000 bytes — a char-count check would wrongly accept this.
    expect(writeHandoff({ qasm: "中".repeat(3000) })).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("accepts qasm at exactly the byte cap", () => {
    expect(writeHandoff({ qasm: "x".repeat(QASM_SUBMIT_BYTE_CAP) })).toBe(true);
  });
});

describe("name hygiene", () => {
  it("trims the name; a whitespace-only name is dropped entirely", () => {
    writeHandoff({ qasm: QASM, name: "  Bell  " });
    expect(peekHandoff()).toMatchObject({ name: "Bell" });
    sessionStorage.clear();
    writeHandoff({ qasm: QASM, name: "   " });
    expect(peekHandoff()).not.toHaveProperty("name");
  });

  it("caps the name at 80 characters", () => {
    writeHandoff({ qasm: QASM, name: "n".repeat(200) });
    expect(peekHandoff()!.name).toBe("n".repeat(80));
  });
});

describe("stored-value validation (hostile/corrupt sessionStorage)", () => {
  it.each([
    ["not JSON", "{nope"],
    ["wrong version", JSON.stringify({ v: 2, qasm: QASM, ts: 1 })],
    ["missing qasm", JSON.stringify({ v: 1, ts: 1 })],
    ["empty qasm", JSON.stringify({ v: 1, qasm: "  ", ts: 1 })],
    ["over-cap qasm", JSON.stringify({ v: 1, qasm: "x".repeat(QASM_SUBMIT_BYTE_CAP + 1), ts: 1 })],
    ["non-numeric ts", JSON.stringify({ v: 1, qasm: QASM, ts: "now" })],
    ["null ts", JSON.stringify({ v: 1, qasm: QASM, ts: null })],
    ["infinite ts", JSON.stringify({ v: 1, qasm: QASM, ts: "Infinity" })],
  ])("peek -> null for %s; consume -> null AND clears the garbage", (_label, raw) => {
    sessionStorage.setItem(KEY, raw);
    expect(peekHandoff()).toBeNull();
    expect(consumeHandoff()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull(); // garbage never lingers
  });

  it("an empty stored name is normalized away rather than returned", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, qasm: QASM, name: "", ts: 1 }));
    const h = peekHandoff();
    expect(h).toMatchObject({ qasm: QASM, ts: 1 });
    expect(h).not.toHaveProperty("name");
  });
});
