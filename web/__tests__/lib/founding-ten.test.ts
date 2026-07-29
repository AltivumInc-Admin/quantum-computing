/**
 * @jest-environment node
 */
import {
  normalizeEmail, hashEmail, allBadges, badgeBySlug,
  badgeForEmailHash, badgeSlug, COHORT_SIZE,
} from "@/lib/founding-ten";
import registry from "@/data/founding-ten.json";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("normalizeEmail", () => {
  it("lowercases and trims, so case and stray whitespace cannot detach a badge", () => {
    expect(normalizeEmail("  Charter.One@Example.Invalid ")).toBe("charter.one@example.invalid");
  });
});

describe("hashEmail", () => {
  it("matches a known SHA-256 vector", async () => {
    await expect(hashEmail("test@example.com")).resolves.toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
  });

  it("is normalization-invariant", async () => {
    expect(await hashEmail(" TEST@Example.com ")).toBe(await hashEmail("test@example.com"));
  });
});

describe("registry integrity", () => {
  it("uses only the two known cohorts", () => {
    expect(Object.keys(registry).sort()).toEqual(["charter", "patron"]);
  });

  it("has unique serials within 1..10 per cohort", () => {
    for (const cohort of ["charter", "patron"] as const) {
      const serials = (registry[cohort] as { serial: number }[]).map((b) => b.serial);
      expect(new Set(serials).size).toBe(serials.length);
      for (const s of serials) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(COHORT_SIZE);
      }
    }
  });

  // The repo is public. A committed email or sub would be a permanent leak.
  it("contains no PII-shaped fields", () => {
    const raw = JSON.stringify(registry);
    expect(raw).not.toMatch(/"(email|sub|userId|username)"\s*:/);
    expect(raw).not.toMatch(/@/);
  });

  it("stores every emailHash as 64 hex characters", () => {
    for (const b of allBadges()) expect(b.emailHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses ISO dates", () => {
    for (const b of allBadges()) expect(b.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has artwork committed for every issued badge", () => {
    for (const b of allBadges()) {
      const base = path.join(process.cwd(), "public", "badges", badgeSlug(b));
      expect(existsSync(`${base}.png`)).toBe(true);
      expect(existsSync(`${base}.webp`)).toBe(true);
    }
  });
});

describe("lookup", () => {
  it("resolves a badge by its slug", () => {
    const first = allBadges()[0];
    if (!first) return; // empty registry is valid before the first issuance
    expect(badgeBySlug(badgeSlug(first))).toEqual(first);
  });

  it("returns null for an unissued slug", () => {
    // Serial 11 is out of the 1-10 range and can never be issued (unlike, say,
    // charter-09, which IS issuable and would red this test the moment it is).
    expect(badgeBySlug("charter-11")).toBeNull();
  });

  it("finds nothing for an unknown hash", () => {
    expect(badgeForEmailHash("0".repeat(64))).toEqual([]);
  });
});

describe("cross-implementation parity", () => {
  it("the issuance script produces the same hash as the browser function", async () => {
    const script = path.join(process.cwd(), "..", "scripts", "badge-email-hash.mjs");
    // Feed the SAME raw, unnormalized string to both implementations. If either
    // side's normalization diverges (e.g. one adds Gmail dot-stripping or
    // +tag removal and the other doesn't), this must catch it — pre-normalizing
    // one side before comparing would hide exactly that class of drift.
    const raw = "  Test@Example.com ";
    const cli = execFileSync("node", [script, raw]).toString().trim();
    expect(cli).toBe(await hashEmail(raw));
  });
});
