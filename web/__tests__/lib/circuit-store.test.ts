/**
 * @jest-environment jsdom
 */
import {
  CIRCUIT_KEY_PREFIX,
  deleteCircuit,
  listCircuits,
  MAX_CIRCUIT_NAME,
  MAX_CIRCUIT_SRC,
  MAX_SAVED_CIRCUITS,
  readCircuit,
  saveCircuit,
} from "@/lib/circuit-store";

// jsdom does not ship crypto.randomUUID; the store mints ids with it.
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
}
if (typeof globalThis.crypto.randomUUID !== "function") {
  let counter = 0;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`,
    configurable: true,
  });
}

const key = (id: string) => `${CIRCUIT_KEY_PREFIX}${id}`;

/** Count qc-progress dispatches during fn. */
function countProgressEvents(fn: () => void): number {
  let events = 0;
  const listener = () => events++;
  window.addEventListener("qc-progress", listener);
  try {
    fn();
  } finally {
    window.removeEventListener("qc-progress", listener);
  }
  return events;
}

beforeEach(() => localStorage.clear());

describe("saveCircuit — fresh save", () => {
  it("mints an id, stores under qc:circuit:<id>, and returns the circuit", () => {
    const result = saveCircuit({ name: "Bell", src: "H 0\nCNOT 0 1" }, 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.circuit).toMatchObject({ name: "Bell", src: "H 0\nCNOT 0 1", updatedAt: 1000 });
    expect(result.circuit.id).toEqual(expect.any(String));
    expect(result.circuit.id.length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(key(result.circuit.id))!)).toEqual({
      v: 1,
      name: "Bell",
      src: "H 0\nCNOT 0 1",
      updatedAt: 1000,
    });
  });

  it("dispatches qc-progress EXACTLY once per save (sync debounce depends on this)", () => {
    expect(countProgressEvents(() => saveCircuit({ name: "Bell", src: "H 0" }, 1000))).toBe(1);
  });

  it("records Runbook activity for the save's own timestamp", () => {
    const nowMs = 20_600 * 86_400_000 + 3_600_000; // mid-day on epoch day 20600
    saveCircuit({ name: "Bell", src: "H 0" }, nowMs);
    expect(localStorage.getItem("qc:log:day:20600")).toBe("1");
  });

  it("trims the name before storing", () => {
    const result = saveCircuit({ name: "  Bell  ", src: "H 0" }, 1);
    expect(result.ok && result.circuit.name).toBe("Bell");
  });
});

describe("saveCircuit — caps and rejections", () => {
  it.each([
    ["empty name", { name: "", src: "H 0" }],
    ["whitespace-only name", { name: "   ", src: "H 0" }],
    ["over-cap name", { name: "n".repeat(MAX_CIRCUIT_NAME + 1), src: "H 0" }],
    ["empty src", { name: "Bell", src: "" }],
    ["whitespace-only src", { name: "Bell", src: "  \n  " }],
    ["over-cap src", { name: "Bell", src: "H".repeat(MAX_CIRCUIT_SRC + 1) }],
  ])("rejects %s without writing or dispatching", (_label, input) => {
    let result: ReturnType<typeof saveCircuit> | undefined;
    const events = countProgressEvents(() => {
      result = saveCircuit(input, 1);
    });
    expect(result!.ok).toBe(false);
    expect(events).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it("accepts a name and src exactly at their caps", () => {
    const result = saveCircuit(
      { name: "n".repeat(MAX_CIRCUIT_NAME), src: "H".repeat(MAX_CIRCUIT_SRC) },
      1,
    );
    expect(result.ok).toBe(true);
  });

  it("errors on the 21st NEW circuit but lets overwrites through at the cap", () => {
    let firstId = "";
    for (let i = 0; i < MAX_SAVED_CIRCUITS; i++) {
      const r = saveCircuit({ name: `c${i}`, src: "H 0" }, i + 1);
      expect(r.ok).toBe(true);
      if (r.ok && i === 0) firstId = r.circuit.id;
    }
    // 21st fresh save refused with an honest error...
    const overflow = saveCircuit({ name: "one too many", src: "H 0" }, 100);
    expect(overflow).toEqual({
      ok: false,
      error: `save limit reached (${MAX_SAVED_CIRCUITS}) — delete a circuit first`,
    });
    // ...but overwriting an existing id does not count against the cap.
    const overwrite = saveCircuit({ id: firstId, name: "c0 v2", src: "X 0" }, 200);
    expect(overwrite.ok).toBe(true);
    expect(readCircuit(firstId)).toMatchObject({ name: "c0 v2", src: "X 0", updatedAt: 200 });
    expect(listCircuits()).toHaveLength(MAX_SAVED_CIRCUITS);
  });

  it("a REVIVAL of a tombstoned id counts against the cap (it is a new live row)", () => {
    const first = saveCircuit({ name: "victim", src: "H 0" }, 1);
    if (!first.ok) throw new Error("setup save failed");
    deleteCircuit(first.circuit.id, 2);
    for (let i = 0; i < MAX_SAVED_CIRCUITS; i++) {
      expect(saveCircuit({ name: `c${i}`, src: "H 0" }, i + 3).ok).toBe(true);
    }
    const revival = saveCircuit({ id: first.circuit.id, name: "victim", src: "H 0" }, 100);
    expect(revival.ok).toBe(false);
  });
});

describe("deleteCircuit — value tombstone, never key removal", () => {
  it("keeps the KEY with a {v:1, deleted:true, updatedAt} value", () => {
    const saved = saveCircuit({ name: "Bell", src: "H 0" }, 1000);
    if (!saved.ok) throw new Error("setup save failed");
    deleteCircuit(saved.circuit.id, 2000);
    expect(JSON.parse(localStorage.getItem(key(saved.circuit.id))!)).toEqual({
      v: 1,
      deleted: true,
      updatedAt: 2000,
    });
  });

  it("dispatches qc-progress once; a missing id dispatches nothing", () => {
    const saved = saveCircuit({ name: "Bell", src: "H 0" }, 1);
    if (!saved.ok) throw new Error("setup save failed");
    expect(countProgressEvents(() => deleteCircuit(saved.circuit.id, 2))).toBe(1);
    expect(countProgressEvents(() => deleteCircuit("no-such-id", 3))).toBe(0);
  });

  it("hides the circuit from listCircuits and readCircuit", () => {
    const saved = saveCircuit({ name: "Bell", src: "H 0" }, 1);
    if (!saved.ok) throw new Error("setup save failed");
    deleteCircuit(saved.circuit.id, 2);
    expect(listCircuits()).toEqual([]);
    expect(readCircuit(saved.circuit.id)).toBeNull();
  });
});

describe("listCircuits", () => {
  it("sorts by updatedAt descending", () => {
    saveCircuit({ name: "oldest", src: "H 0" }, 100);
    saveCircuit({ name: "newest", src: "H 0" }, 300);
    saveCircuit({ name: "middle", src: "H 0" }, 200);
    expect(listCircuits().map((c) => c.name)).toEqual(["newest", "middle", "oldest"]);
  });

  it("skips corrupt JSON rows and rows failing the validator", () => {
    saveCircuit({ name: "good", src: "H 0" }, 1);
    localStorage.setItem(key("corrupt"), "{not json");
    localStorage.setItem(key("wrong-shape"), JSON.stringify({ v: 1, updatedAt: 5 })); // no name/src
    localStorage.setItem(key("bad-stamp"), JSON.stringify({ v: 1, name: "x", src: "H 0", updatedAt: "soon" }));
    localStorage.setItem(key("wrong-version"), JSON.stringify({ v: 2, name: "x", src: "H 0", updatedAt: 5 }));
    expect(listCircuits().map((c) => c.name)).toEqual(["good"]);
  });

  it("ignores non-circuit qc:* keys entirely", () => {
    localStorage.setItem("qc:section:intro", "1");
    localStorage.setItem("qc:card:x", JSON.stringify({ reps: 1 }));
    expect(listCircuits()).toEqual([]);
  });
});

describe("readCircuit", () => {
  it("returns null for an unknown id", () => {
    expect(readCircuit("nope")).toBeNull();
  });

  it("returns the saved circuit with its id rehydrated", () => {
    const saved = saveCircuit({ name: "Bell", src: "H 0" }, 42);
    if (!saved.ok) throw new Error("setup save failed");
    expect(readCircuit(saved.circuit.id)).toEqual({
      id: saved.circuit.id,
      name: "Bell",
      src: "H 0",
      updatedAt: 42,
    });
  });
});
