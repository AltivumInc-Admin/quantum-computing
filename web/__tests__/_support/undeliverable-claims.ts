/**
 * The undeliverable-claim ban list, and the matcher that applies it.
 *
 * Not a test file — it holds no assertions, and jest.config.ts excludes this
 * directory from collection (jest's default testMatch treats EVERY file under
 * __tests__ as a suite). It lives here rather than in web/src because nothing
 * ships it: it is scaffolding for the copy-honesty guards, not product code.
 * `changelog-ban-list.ts` is its sibling and the shape this file follows.
 *
 * WHY IT IS SHARED, which is the whole reason this file exists.
 *
 * It was a `const` inside __tests__/app/pricing-page.test.tsx, and so it guarded
 * exactly one route. The at-cost pattern below was written when the pricing page
 * dropped "billed at cost with no markup" (2026-09, commit d216724) — and the same
 * retired promise went on shipping in six places on the two HARDWARE surfaces
 * (qpu-submit-panel.tsx, playground/hardware-panel.tsx) for want of a guard that
 * looked at them. A page-scoped ban list reads as coverage and is not: the claim
 * simply moves to a surface the list cannot see. Anything that imports this file
 * inherits every pattern in it, so the next pattern added for one surface starts
 * life covering all of them.
 *
 * Consumers today:
 *   - __tests__/app/pricing-page.test.tsx        rendered page (both locales) + metadata export
 *   - __tests__/infra/hardware-copy-honesty.test.ts   the two hardware money surfaces, by source
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARD DOES NOT CATCH — read this before trusting a green run.
 *
 * It is a denylist of phrasings. A denylist cannot be complete, and a passing run is
 * NOT evidence that a surface is honest. Specifically it will miss:
 *
 *   - Any reworded claim. The patterns aim at capability CONCEPTS rather than the
 *     exact sentences that were removed, which widens them, but a synonym or an unusual
 *     sentence shape still walks straight through. ("Front-of-line hardware scheduling"
 *     is caught; some phrasing nobody thought of is not.) The at-cost entry is the
 *     standing proof: "You pay for these runs at cost. We add nothing on top." was
 *     caught by vocabulary, and the sentence beside it — "That exact figure is what
 *     comes out of your wallet" — is the identical promise with none of the words.
 *   - Claims made in a language whose vocabulary is not enumerated here. Both shipped
 *     locales have terms in these patterns; a third would arrive with essentially no
 *     coverage until its words are added. English-only surfaces (the pricing metadata
 *     export, the hardcoded English on both hardware surfaces) get English coverage only.
 *   - Any surface nobody pointed this at. Adding a surface to the product does not add
 *     it to a guard — that is the defect this file was extracted to stop repeating, and
 *     extracting it does not by itself scan anything new. Route metadata, the OG image,
 *     JSON-LD, the Stripe product descriptions, the lesson pages and the welcome page
 *     all sell the same wallet and none of them is read by any consumer listed above.
 *   - Non-textual claims. A capability implied by a control, a chip, a table column, or
 *     an icon has no words for a scan to catch.
 *   - Placement. A true sentence can still mislead by WHERE it renders: "Before you
 *     buy:" was accurate copy sitting after all three purchase controls, and a text scan
 *     cannot see position. That needed its own structural assertion; assume the next
 *     placement defect will need one too.
 *   - Absolute promises. A sentence can be undeliverable by being unconditional rather
 *     than by naming a capability: "nothing else will ever cost credits" was a FREE
 *     promise a buyer could hold us to, contradicted by the pricing page's own rate
 *     table. One pattern below bars that exact shape; the category is wide open, and
 *     note the direction — most patterns here bar overselling, and this one bars
 *     overpromising free, which review tends not to look for.
 *   - Arithmetic. The guard reads words, never numbers. That the pricing estimator says
 *     197 credits ($1.97) where the pre-flight says $1.75 is invisible here; only the
 *     PHRASINGS that assert the two agree are barred, not the divergence itself.
 *   - Anything true-sounding but stale: a claim that WAS true and quietly stopped being
 *     true only has a pattern here once somebody has noticed and written one. The
 *     parity, live-rate-feed and present-tense-metering patterns were all added that
 *     way, after the fact — which is the point: they are proof the category exists, not
 *     proof it is covered.
 *
 * So this catches regressions of known-false claims on the surfaces that import it.
 * Judging new copy is still a human job: check it against what the deployed Lambdas
 * actually do.
 * ---------------------------------------------------------------------------
 *
 * Adding a pattern: only bar a claim you have confirmed the code cannot deliver, and
 * say where you confirmed it. A claim that becomes true belongs out of this list, not
 * worked around.
 *  - Source comments and docs. A maintainer's docstring can assert the opposite
 *    of what these patterns bar (cost-estimator.tsx's did) and no test reads it.
 *    This caveat matters MORE since the hardware guard joined: that consumer
 *    strips comments before scanning, precisely so a comment explaining the ban
 *    cannot trip it — which means a comment making the banned claim is invisible
 *    to both consumers, not just to the rendered-text one.
 */

export interface UndeliverableClaim {
  /**
   * A stable handle, so a consumer can select or exempt one entry without depending
   * on list order or on a regex source string. The pricing page applies the whole
   * list; the hardware guard exempts two by id and says why, which is only auditable
   * because the ids are spelled out at the exemption site.
   */
  id: string;
  pattern: RegExp;
  why: string;
}

/** Words that assert entitlement, in both shipped languages. */
const ENTITLEMENT =
  "(?:includes?|included|access to|available (?:on|in|with)|incluye|incluid[oa]s?|acceso a|disponible (?:en|con))";
const TUTOR_MODEL = "(?:haiku|sonnet|opus|fable)";

/**
 * Either order inside ONE sentence: "Plus includes Opus" and "Opus, included with
 * Plus" are the same claim. The first draft of this pattern only matched the first
 * order, and "Claude Sonnet included in the tutor" passed it.
 */
export const modelEntitlement = new RegExp(
  `\\b${ENTITLEMENT}\\b[^.!?]{0,60}\\b${TUTOR_MODEL}\\b` +
    `|\\b${TUTOR_MODEL}\\b[^.!?]{0,60}\\b${ENTITLEMENT}\\b`,
  "i",
);

/**
 * Metering asserted in the PRESENT tense. Nothing meters anything: lambda/tutor's
 * metering is gated on deployed configuration it does not have (WalletTableName and
 * RATE_CARD are both empty, so `metering` is undefined, every paid model is refused
 * and every question is answered free), lambda/qpu grants no allowance
 * (LIFETIME_CAP_MICROS = 0) and refuses every submit it cannot fund, and no
 * code path outside lambda/stripe touches the wallet. So
 * every metering sentence has to be future tense, and this is the pattern
 * the pricing page's metadata needed — its description read "one credit wallet METERS the only two
 * things that cost real money" for four review rounds.
 *
 * The lookbehinds are what make it usable: "will meter" / "would meter" is the honest
 * copy that page is full of, and matching a bare "meter(s)" without excluding those
 * would redden every truthful sentence. "metered" and "metering" are deliberately not
 * matched — they appear almost exclusively in negations ("nothing is metered yet") and
 * in "once metering ships", and a denylist reading raw text cannot see a negation.
 *
 * The Spanish arm needs its own negation lookbehind and was written without one: the
 * honest "Nada más costará créditos jamás — y hoy tampoco SE MIDE ninguna de esas dos"
 * matched, because the negation sits outside the span (the same trap documented on the
 * wallet-spend pattern below). Excluding "no/nada/tampoco/nunca/ni [se] mide" leaves the
 * affirmative "la billetera mide…" caught and the denial uncaught.
 */
export const presentTenseMetering = new RegExp(
  `\\b(?:wallet|credits?)\\b[^.!?]{0,40}\\b(?<!\\b(?:will|would|shall|to|never)\\s)meters?\\b` +
    `|\\b(?:billetera|créditos?|saldo)\\b[^.!?]{0,40}\\b(?<!\\b(?:no|nada|tampoco|nunca|ni)\\s(?:se\\s)?)(?:mide|miden)\\b`,
  "i",
);

export const UNDELIVERABLE_CLAIMS: readonly UndeliverableClaim[] = [
  {
    id: "at-cost",
    // The at-cost / no-markup framing. CLAUDE.md rules 5 and 9 retired it: every
    // metered surface debits at one shared factor over true cost, so "at cost" is
    // not what we sell, and rule 6 forbids the repo from carrying the
    // spread that would make any such claim checkable. scripts/stripe/
    // check-catalog-parity.mjs already bars the same three phrasings on the Stripe
    // product descriptions; this is the same denylist pointed at the product's own copy.
    //
    // The Spanish arm anchors on "a costo" / "a precio de costo" rather than the
    // bare noun: es.ts is full of honest cost talk ("te muestra su costo", "el
    // costo exacto"), and a pattern that fired on those would redden truthful copy.
    pattern:
      /\b(at cost|cost price|no mark-?up|without mark-?up|sin (margen|recargo|sobreprecio)|a (precio de )?costo)\b/i,
    why: "at-cost/no-markup pricing: CLAUDE.md rules 5 and 9 retired that framing, and rule 6 keeps the spread out of this repo entirely",
  },
  {
    id: "present-tense-metering",
    pattern: presentTenseMetering,
    why: "present-tense metering: the tutor charges nothing, the QPU lambda refuses unfunded submits, and nothing outside lambda/stripe reads the wallet",
  },
  {
    id: "sponsored-hardware",
    // The withdrawn promise. lambda/qpu/qpu-core.mjs sets LIFETIME_CAP_MICROS = 0 and
    // no wallet table is wired, so no new learner holds a platform-funded allowance and
    // every hardware submit without one is refused (402). Sponsorship copy kept
    // shipping for weeks after the withdrawal precisely because the old tests locked
    // its PRESENCE — this bars it from coming back, in either locale.
    // Stem-matched (\w*): "sponsoring", "sponsorships" and Spanish finite verb
    // forms (patrocina, patrocinamos) must not walk past a suffix list.
    pattern: /\b(sponsor\w*|patrocin\w*)\b/i,
    why: "sponsored hardware: LIFETIME_CAP_MICROS is 0 and no wallet is wired — nobody gets a platform-funded run",
  },
  {
    id: "blanket-free-promise",
    // lib/pricing.ts SIMULATOR_RATES publishes SV1 and DM1 at 8.4 credits/minute and
    // the pricing page's own rate table renders both, so "credits will meter exactly two
    // things ... nothing else will ever cost credits" was contradicted a section later
    // by the page itself. Note the direction: this bars an absolute promise of FREE, a
    // claim a buyer can hold us to, not an oversell. It is the narrow shape only —
    // "everything else is free" phrased without the credit noun walks through.
    pattern:
      /\b(?:nothing|anything|everything) else\b[^.!?]{0,50}\b(?:credits?|cost|costs|charged?)\b|\bnada más\b[^.!?]{0,50}\b(?:cr[ée]ditos?|cuesta|costar[áa])\b/i,
    why: "blanket free promise: SIMULATOR_RATES publishes SV1/DM1 per minute in credits, in the pricing page's own rate table",
  },
  {
    id: "estimate-parity-definite-article",
    // The parity claim's other shape: not "the same estimate" but a definite article
    // pointing back at the credit figure the estimator just rendered — "The estimate is
    // always shown before you commit", in a paragraph about the published credit rate.
    // What a learner is actually shown before a run is qpu-budget.ts `costMicros` in
    // AWS dollars. The approval gate is real; the identity of the number is not.
    pattern:
      /\b(?:the|that|this) estimate\b[^.!?]{0,50}\bbefore you (?:commit|buy|pay|run|submit|approve)\b|\bla estimación\b[^.!?]{0,50}\bantes de (?:confirmar|comprar|pagar|ejecutar|aprobar|enviar)\b/i,
    why: "estimate parity by definite article: the number shown before a run is AWS dollars from qpu-budget.ts, not the pricing page's credit figure",
  },
  {
    id: "tutor-model-unlocks",
    // lambda/tutor/index.mjs DOES read body.model and gate it on ROSTER by the
    // caller's tier — but only when `metering` is defined, which needs a wallet
    // table and a rate card the deployed function does not have. Without them
    // every paid model is refused (METERING_UNAVAILABLE) and every question is
    // answered free on the free-tier default, so an "unlocked" claim is one a
    // buyer cannot cash. Retire this when that configuration ships, not before.
    pattern: /\b(unlock(ed|s|ing)?|desbloquea\w*)\b/i,
    why: "tutor model unlocks: the deployed tutor has no wallet table or rate card, so it refuses every paid model",
  },
  {
    id: "model-entitlement",
    // Same reason, said the other way round: a model presented as bundled with a plan.
    // Bounded to one sentence so it cannot span unrelated copy.
    pattern: modelEntitlement,
    why: "model entitlement: every question is answered by the one hardcoded tutor model",
  },
  {
    id: "multi-backend-wallet-runs",
    // lambda/qpu/qpu-core.mjs hardcodes DEVICE = "iqm_garnet".
    pattern: /any (quantum )?backend from your balance/i,
    why: "wallet-billed multi-backend runs: the QPU lambda is hardcoded to IQM Garnet",
  },
  {
    id: "backend-selection",
    pattern: /choose the physics your budget/i,
    why: "backend selection: only IQM Garnet is submittable",
  },
  {
    id: "priority-queue",
    // grep finds no queue, priority, or scheduling concept in lambda/qpu or infra.
    // Braket task submission is FIFO to the provider; we control nothing about it.
    pattern:
      /\b(priority|prioriti[sz]ed|front[- ]of[- ]line|skip the (line|queue)|prioridad|prioritari[oa]s?)\b/i,
    why: "priority/queue position: no queue or scheduling concept exists in the codebase",
  },
  {
    id: "backend-early-access",
    // Nothing reads quantum-stripe-wallet except lambda/stripe and the wallet badge.
    pattern: /early access to new backends|acceso anticipado a (nuevos )?backends/i,
    why: "backend early access: there is no per-tier backend gating",
  },
  {
    id: "tutor-live-cost-display",
    // The defect this guard was extended for: ask-tutor.tsx (473 lines) renders no
    // cost, credit, price, or wallet value anywhere. A present-tense claim that the
    // tutor surface displays a price is false.
    // Both languages' word for the surface, or the pattern only guards English: the
    // Spanish twin of the same sentence ("el margen muestra el costo…") passed until
    // "margen" was added here.
    pattern:
      /\b(margin|margen|tutor)\b[^.!?]{0,60}\b(shows?|displays?|muestra\w*)\b[^.!?]{0,30}\b(cost|price|credits?|costo|precio|créditos?)\b/i,
    why: "live cost display in the tutor: ask-tutor.tsx renders no cost, credit, or price",
  },
  {
    id: "wallet-spend",
    // Nothing outside lambda/stripe reads the wallet: the credit balance has no sink,
    // so a present-tense "this spends your credits" is false today.
    //
    // Deliberately the narrowest pattern here, and the weakest. A bare
    // /debits?.{0,40}wallet/ reddened the FAQ's honest "No part of the platform debits
    // your wallet today" — the negation lives OUTSIDE the matched span, and a denylist
    // reading raw text cannot see it. So this matches only affirmative sales
    // constructions. Cost: a false claim phrased some third way walks through.
    pattern:
      /\b(spends?|spending|uses?) (your|tu|su) (credits?|balance|wallet|saldo|billetera)\b|\b(comes? out of|billed (to|from)|charged to|deducted from|se (cobra|descuenta|debita) de)\b[^.!?]{0,30}\b(balance|wallet|saldo|billetera)\b/i,
    why: "wallet spend: nothing outside lambda/stripe reads the wallet, so nothing debits it",
  },
  {
    id: "estimate-parity",
    // Estimate parity. The pricing page's estimator prices CREDITS from lib/pricing.ts
    // (IQM Garnet: 0.163 credits/shot + the 34-credit task fee = 197 credits for a
    // 1,000-shot run). The pre-flight a learner actually meets prices USD from
    // lib/qpu-budget.ts `costMicros`, whose rates come from PRICING.IQM in
    // components/quantum/cost.ts ($0.30/task + $0.00145/shot = $1.75) — a different
    // table, a different currency, ~12.6% apart. Two of the eight backends priced there
    // are not even submittable, so for those no "real submission" exists to precede.
    // Retire this pattern only when one table feeds both surfaces.
    pattern:
      /\b(the |that |this )?(same|identical|misma|mismo|idéntic[oa])\b[^.!?]{0,25}\b(estimate|estimation|quote|number|figure|price|estimación|cotización|cifra|número|precio)\b|\b(estimate|estimación)\b[^.!?]{0,40}\b(matches|is the same|coincide|es la misma)\b/i,
    why: "estimate parity: the pricing page prices credits, the pre-flight prices AWS dollars — different tables",
  },
  {
    id: "live-rate-feed",
    // A live rate feed. lib/pricing.ts is a hardcoded array stamped `PRICES_AS_OF`, and
    // components/quantum/cost.ts is a hardcoded const; both compile into the static
    // export. Nothing anywhere fetches a provider rate, at submission time or ever — a
    // reprice takes a code change and a redeploy.
    pattern:
      /\b(live|real[- ]?time|up[- ]to[- ]the[- ]minute|en vivo|en tiempo real)\b[^.!?]{0,40}\b(rates?|prices?|pricing|tarifas?|precios?)\b|\b(rates?|prices?|estimate|tarifas?|precios?|estimación)\b[^.!?]{0,50}\b(at submission time|in real[- ]?time|automatically|al momento del envío|en tiempo real|vigente|automáticamente)\b/i,
    why: "live rate feed: both rate tables are hardcoded constants compiled into the static export",
  },
];

/**
 * The one entry with this id, or a thrown error naming what is available.
 *
 * Throwing rather than returning undefined is the point: a consumer that selects or
 * exempts a pattern by id must go RED when the id is renamed away, not silently scan
 * a shorter list. That is the same vacuity failure the pricing page's ban-list tests
 * already guard against by looking patterns up by identity instead of by index.
 */
export function claimById(id: string): UndeliverableClaim {
  const found = UNDELIVERABLE_CLAIMS.find((c) => c.id === id);
  if (!found) {
    throw new Error(
      `unknown undeliverable-claim id "${id}" — known ids: ${UNDELIVERABLE_CLAIMS.map((c) => c.id).join(", ")}`,
    );
  }
  return found;
}

/**
 * Every banned claim `text` makes, as human-readable failures.
 *
 * All patterns are evaluated rather than failing on the first, because the first to
 * fire is not necessarily the one whose `why` names the real defect: reintroducing
 * the blanket "Nada más costará créditos jamás" reported the present-tense-metering
 * pattern instead, which would have sent a maintainer after the wrong root cause.
 *
 * `label` is "which surface" — a locale code for a rendered scan, a metadata path for
 * the pricing page's export scan, a repo-relative file path for a source scan.
 *
 * Note what this matcher deliberately does NOT do, because a reviewer has asked twice:
 * it never exonerates. `text.match(pattern)` fires on a match at ANY position, and
 * negation handling lives inside the individual patterns as immediate-word lookbehinds
 * ("will meter", "no se mide"), so a negated clause suppresses only itself and the
 * engine walks past it to any later affirmative use. Do not "simplify" this into a
 * first-match-with-negation-window shape; the changelog's matcher was that shape and
 * two-clause prose walked through it.
 */
export function undeliverableClaimHits(
  text: string,
  label: string,
  claims: readonly UndeliverableClaim[] = UNDELIVERABLE_CLAIMS,
): string[] {
  return claims.flatMap(({ pattern, why }) => {
    const hit = text.match(pattern);
    return hit ? [`[${label}] advertised "${hit[0]}" — ${why}`] : [];
  });
}
