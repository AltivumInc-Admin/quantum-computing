/**
 * Rule 8, made checkable OFFLINE: `TIERS` in web/src/lib/pricing.ts and `CATALOG`
 * in lambda/stripe/index.mjs must stay in lockstep, and so must the top-up bounds
 * the two sides enforce.
 *
 * That lockstep used to be asserted as two independent copies of the same
 * literals — lambda/stripe/index.test.mjs pins CATALOG against hardcoded numbers
 * without reading pricing.ts, and every web assertion derives its figures from
 * TIERS itself, so both suites are self-consistent by construction and neither can
 * see a one-sided edit. The only comparison that actually read both files was
 * scripts/stripe/check-catalog-parity.mjs, which needs a Stripe key, an
 * --expect-account and the network, and runs by hand from the Makefile — never in
 * `npm test` and never in CI. Repricing a grant in pricing.ts therefore left every
 * suite green while checkout stamped the OLD figure into subscription metadata,
 * which is what the wallet is credited from.
 *
 * This is the half a clone can check with no credentials: parse the Lambda source
 * the way check-catalog-parity.mjs already does, and compare. It reads the Lambda
 * as TEXT rather than importing it, following __tests__/infra/rate-card-parity.test.ts
 * — the handler pulls in the AWS SDK at module scope, which a jsdom-free web suite
 * has no business loading.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { TIERS, TOPUP_MIN_USD, TOPUP_MAX_USD, type Tier } from "@/lib/pricing";
import type { CheckoutLookupKey, TopUpLookupKey } from "@/lib/billing-client";

const REPO = join(__dirname, "..", "..", "..");
const stripeIndex = readFileSync(join(REPO, "lambda/stripe/index.mjs"), "utf8");

interface CatalogEntry {
  mode: string;
  tier: string | null;
  credits: number;
}

/**
 * The CATALOG object literal, one entry per line, in the shape
 * `ql_x: { mode: "…", tier: "…" | null, credits: N },`. Same regex shape
 * check-catalog-parity.mjs:58-69 uses, pointed the other way.
 */
function parseCatalog(source: string): Record<string, CatalogEntry> {
  const block = source.match(/export const CATALOG = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("CATALOG literal not found in lambda/stripe/index.mjs");
  const entry =
    /(\w+):\s*\{\s*mode:\s*"(\w+)",\s*tier:\s*(?:"(\w+)"|null),\s*credits:\s*(\d+)\s*\}/g;
  const out: Record<string, CatalogEntry> = {};
  for (const m of block[1].matchAll(entry)) {
    out[m[1]] = { mode: m[2], tier: m[3] ?? null, credits: Number(m[4]) };
  }
  return out;
}

function parseConst(source: string, name: string): number {
  const m = source.match(new RegExp(`export const ${name} = (\\d+);`));
  if (!m) throw new Error(`${name} not found in lambda/stripe/index.mjs`);
  return Number(m[1]);
}

const CATALOG = parseCatalog(stripeIndex);

describe("TIERS and the backend CATALOG agree (rule 8 lockstep)", () => {
  it("parsed a catalog at all (non-vacuity)", () => {
    // A regex that stops matching after a refactor of the Lambda would turn every
    // assertion below into a pass over an empty object. Fail loudly instead.
    expect(Object.keys(CATALOG).length).toBeGreaterThanOrEqual(6);
    expect(CATALOG.ql_plus_monthly).toBeDefined();
  });

  it.each(TIERS.filter((t) => t.checkoutLookupKey))(
    "$id: the catalog grants exactly what the page advertises",
    (tier: Tier) => {
      const spec = CATALOG[tier.checkoutLookupKey!];
      expect(spec).toBeDefined();
      // The credit count the webhook writes into the wallet, against the count the
      // tier card sells. These are the two numbers a reprice has to move together.
      expect(spec.credits).toBe(tier.monthlyCredits);
      expect(spec.tier).toBe(tier.id);
      expect(spec.mode).toBe("subscription");
    },
  );

  it("every subscription entry in the catalog is a published tier", () => {
    // The inverse direction: a tier sold by the backend that the page never shows
    // is just as much a divergence as one the page shows and the backend cannot sell.
    const sold = Object.entries(CATALOG)
      .filter(([, spec]) => spec.mode === "subscription")
      .map(([key]) => key)
      .sort();
    const published = TIERS.map((t) => t.checkoutLookupKey)
      .filter((k): k is NonNullable<typeof k> => Boolean(k))
      .sort();
    expect(sold).toEqual(published);
  });

  it("the fixed credit packs the client may name all exist in the catalog", () => {
    // TopUpLookupKey is a hand-typed union with no other reader in web/src, so
    // nothing but this pins it to the keys /checkout will actually accept.
    const packs: TopUpLookupKey[] = [
      "ql_credits_500",
      "ql_credits_2000",
      "ql_credits_5000",
      "ql_credits_10000",
    ];
    for (const key of packs) {
      expect(CATALOG[key]).toBeDefined();
      expect(CATALOG[key].mode).toBe("payment");
      // Packs are named for their grant; a mismatch means the button lies.
      expect(CATALOG[key].credits).toBe(Number(key.replace("ql_credits_", "")));
    }
    // ...and the union covers the payment entries, so a new pack cannot ship
    // server-side while the client type still refuses to name it.
    const paymentKeys = Object.entries(CATALOG)
      .filter(([, spec]) => spec.mode === "payment")
      .map(([key]) => key)
      .sort();
    expect(paymentKeys).toEqual([...packs].sort());
    // Type-level: every pack key is assignable to what the client may send.
    const assignable: CheckoutLookupKey[] = packs;
    expect(assignable).toHaveLength(4);
  });
});

describe("the top-up bounds the client enforces are the bounds the server enforces", () => {
  it("matches CUSTOM_TOPUP_MIN_USD / CUSTOM_TOPUP_MAX_USD", () => {
    // Advertised floor vs enforced floor. When these come apart the client rejects
    // a valid amount before a request is ever sent (or sends one the server 400s),
    // with the page's own copy quoting a third figure.
    expect(TOPUP_MIN_USD).toBe(parseConst(stripeIndex, "CUSTOM_TOPUP_MIN_USD"));
    expect(TOPUP_MAX_USD).toBe(parseConst(stripeIndex, "CUSTOM_TOPUP_MAX_USD"));
  });
});
