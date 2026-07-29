/**
 * @jest-environment jsdom
 */
import {
  ANON_OWNER,
  currentOwner,
  setCurrentOwner,
  toLocalKey,
  toCanonicalKey,
  isDeviceGlobalKey,
  ownedLocalKeys,
  claimAnonBucket,
  anonBucketSize,
} from "@/lib/progress-owner";

const SUB = "310b5550-a0f1-70b3-8b4d-9e2a21e1b855";

beforeEach(() => {
  localStorage.clear();
  setCurrentOwner(null);
});

describe("owner identity", () => {
  it("is anonymous until an account claims the device", () => {
    expect(currentOwner()).toBe(ANON_OWNER);
  });

  it("remembers the active owner across a reload", () => {
    setCurrentOwner(SUB);
    expect(currentOwner()).toBe(SUB);
    // A fresh module read (what a reload does) must resolve the same owner
    // SYNCHRONOUSLY — storage reads happen long before auth hydrate resolves,
    // and guessing "anon" first would flash the wrong bucket on every load.
    expect(localStorage.getItem("qc-owner:active")).toBe(SUB);
  });

  it("returns to the anonymous bucket on sign-out", () => {
    setCurrentOwner(SUB);
    setCurrentOwner(null);
    expect(currentOwner()).toBe(ANON_OWNER);
  });
});

describe("key translation", () => {
  it("scopes a canonical key into the owner's bucket", () => {
    expect(toLocalKey("qc:card:x", SUB)).toBe(`qc:o:${SUB}:card:x`);
  });

  it("round-trips back to the canonical shape the server stores", () => {
    const local = toLocalKey("qc:card:x", SUB);
    expect(toCanonicalKey(local, SUB)).toBe("qc:card:x");
  });

  // Card ids embed their own colons — real keys look like
  // qc:card:challenge:bell-pair and qc:card:quiz:<id>. Any translation that
  // split(":") instead of slicing a known prefix would corrupt these.
  it("preserves nested colons in card ids", () => {
    const canonical = "qc:card:challenge:bell-pair";
    const local = toLocalKey(canonical, SUB);
    expect(local).toBe(`qc:o:${SUB}:card:challenge:bell-pair`);
    expect(toCanonicalKey(local, SUB)).toBe(canonical);
  });

  // qc:locale is a DEVICE preference, and the pre-hydration inline script in
  // layout.tsx reads it as a bare literal before any module graph exists — no
  // owner is knowable there. It is also already present in the three live
  // server rows, so applySnapshot receives it on the very first sync: scoping
  // it in either direction would strand the device's language setting.
  it("never scopes a device-global key, in either direction", () => {
    expect(isDeviceGlobalKey("qc:locale")).toBe(true);
    expect(toLocalKey("qc:locale", SUB)).toBe("qc:locale");
    expect(toCanonicalKey("qc:locale", SUB)).toBe("qc:locale");
  });
});

describe("bucket isolation", () => {
  it("lists only the current owner's keys, never another account's", () => {
    localStorage.setItem(`qc:o:${SUB}:card:mine`, "1");
    localStorage.setItem("qc:o:other-sub:card:theirs", "1");
    localStorage.setItem("qc:card:anon-bucket", "1");
    localStorage.setItem("qc:locale", "es");

    const keys = ownedLocalKeys(SUB);
    expect(keys).toEqual([`qc:o:${SUB}:card:mine`]);
  });
});

// Legacy data needs no migration: the anonymous bucket IS the flat namespace,
// so pre-namespacing keys are already exactly where unowned work belongs.
describe("legacy data", () => {
  it("treats pre-namespacing keys as the anonymous bucket, untouched", () => {
    localStorage.setItem("qc:card:old", "1");
    localStorage.setItem("qc:log:day:20594", "1");
    expect(ownedLocalKeys(ANON_OWNER).sort()).toEqual(["qc:card:old", "qc:log:day:20594"]);
    expect(localStorage.getItem("qc:card:old")).toBe("1");
  });

  it("keeps the anonymous bucket blind to every account bucket", () => {
    localStorage.setItem("qc:card:anon", "1");
    localStorage.setItem(`qc:o:${SUB}:card:theirs`, "1");
    localStorage.setItem("qc:locale", "es");
    expect(ownedLocalKeys(ANON_OWNER)).toEqual(["qc:card:anon"]);
  });
});

describe("claiming the anonymous bucket", () => {
  it("reports what is waiting so the user can be asked before anything moves", () => {
    localStorage.setItem("qc:card:a", "1");
    localStorage.setItem("qc:card:b", "1");
    expect(anonBucketSize()).toBe(2);
  });

  it("moves the anonymous bucket into the account only when asked", () => {
    localStorage.setItem("qc:card:a", "1");
    claimAnonBucket(SUB);
    expect(localStorage.getItem(`qc:o:${SUB}:card:a`)).toBe("1");
    expect(anonBucketSize()).toBe(0);
  });

  it("never overwrites work the account already has", () => {
    localStorage.setItem("qc:card:a", "anon-value");
    localStorage.setItem(`qc:o:${SUB}:card:a`, "account-value");
    claimAnonBucket(SUB);
    expect(localStorage.getItem(`qc:o:${SUB}:card:a`)).toBe("account-value");
  });
});
