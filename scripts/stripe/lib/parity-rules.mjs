/**
 * The decisions the Stripe guards make, as pure functions over strings and sets.
 *
 * These used to be inline in the two parity scripts, behind a network call and a
 * top-level await, which meant the only way to exercise them was to point a real
 * key at a real account. They are the parts most likely to be wrong: a regex over
 * a TypeScript file, a set diff, and a copy audit. So they live here, take their
 * input as arguments, and are covered by scripts/stripe/parity-rules.test.mjs —
 * the scripts/changelog/rules.mjs pattern, for the same reason.
 *
 * Zero dependencies and no filesystem: the caller reads pricing.ts and passes the
 * source in.
 */

/** Strip comments so a number inside one can never be read as a field value. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The top-level `{...}` blocks of an array body, found by brace depth rather
 * than by splitting on a formatting-dependent `\n  },`.
 *
 * The old splitter encoded the file's current indentation. Reformat pricing.ts
 * and the tiers silently merge into one block, which pairs the FREE tier's 0/0
 * with the NEXT tier's lookup key — a $0 price reported as drift on a paid tier,
 * a false alarm on exactly the surface these guards police. Depth-scanning makes
 * that structurally impossible instead of relying on a comment warning about it.
 */
function topLevelBlocks(body) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        blocks.push(body.slice(start + 1, i));
        start = -1;
      }
    }
  }
  return blocks;
}

/**
 * Published monthly prices, parsed out of pricing.ts rather than imported: it is
 * TypeScript with i18n key references, and these scripts must run under plain
 * node with no build step.
 *
 * THROWS on a block that names a checkoutLookupKey but whose price or credits
 * the parser cannot read. The old copy `continue`d, and the caller then reported
 * `no TIERS entry in pricing.ts carries checkoutLookupKey "..."` — a DRIFT
 * verdict against Stripe caused entirely by a formatting change in a TypeScript
 * file. A parser that cannot read its input must say so.
 */
export function tierPrices(src) {
  const body = stripComments(src).match(/export const TIERS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1];
  if (!body) throw new Error("could not locate the TIERS array in pricing.ts");
  const out = {};
  for (const block of topLevelBlocks(body)) {
    const lookup = block.match(/^\s*checkoutLookupKey:\s*"([a-z0-9_]+)"/m)?.[1];
    if (!lookup) continue; // free tier: nothing to sell
    // Decimals are read exactly. `(\d+)` alone silently turned 19.5 into 19 and
    // then compared it against Stripe in cents.
    const usd = block.match(/^\s*priceUsdPerMonth:\s*(\d+(?:\.\d+)?)/m)?.[1];
    const credits = block.match(/^\s*monthlyCredits:\s*(\d+)/m)?.[1];
    if (usd === undefined || credits === undefined) {
      throw new Error(
        `pricing.ts: the TIERS entry for "${lookup}" has no readable ` +
          `${usd === undefined ? "priceUsdPerMonth" : "monthlyCredits"}. ` +
          `Fix the parser or the file — do not let this read as Stripe drift.`
      );
    }
    out[lookup] = { usd: Number(usd), credits: Number(credits) };
  }
  return out;
}

/**
 * What an endpoint's subscription is missing, and what it carries that the
 * handler ignores. A `*` subscription satisfies every required event and is
 * reported as such, because it also delivers event families nobody asked for.
 */
export function diffEvents(subscribed, required) {
  const set = new Set(subscribed);
  const wildcard = set.has("*");
  const req = [...required];
  return {
    wildcard,
    missing: wildcard ? [] : req.filter((e) => !set.has(e)).sort(),
    extra: wildcard ? [] : [...set].filter((e) => !req.includes(e)).sort(),
  };
}

/**
 * Retired commercial framing. These are claims about the SPREAD, which rules 5/9
 * settled and rule 6 keeps out of the repo — they must not survive on a
 * customer-facing Stripe product either.
 */
export const RETIRED_CLAIMS = [/\bno markup\b/i, /\bat cost\b/i, /\badd(?:s|ing)? nothing on top\b/i];

/**
 * A Stripe product description, audited against what the handler actually
 * grants. Customer-facing copy at Checkout, so it is a rule 13 surface sitting
 * outside every rule 13 guard.
 */
export function auditDescription(description, credits) {
  const desc = description ?? "";
  const issues = [];
  for (const n of desc.matchAll(/([\d,]{3,})\s+credits/gi)) {
    const stated = Number(n[1].replace(/,/g, ""));
    if (stated !== credits) issues.push(`product description advertises ${n[1]} credits; CATALOG grants ${credits}`);
  }
  for (const re of RETIRED_CLAIMS) {
    const hit = desc.match(re);
    if (hit) issues.push(`product description still makes the retired claim "${hit[0]}" (rules 5/9)`);
  }
  return issues;
}

/**
 * Prices are IMMUTABLE in Stripe: an amount change means a new price with the
 * lookup_key transferred onto it. This is the decision of whether that dance is
 * needed at all.
 */
export function priceNeedsReplacing(current, want) {
  if (!current) return true;
  return (
    current.unit_amount !== want.amount ||
    Boolean(current.recurring) !== want.recurring ||
    current.product !== want.product
  );
}
