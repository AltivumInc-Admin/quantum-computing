/**
 * @jest-environment jsdom
 */
// web/__tests__/app/pricing-page.test.tsx
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import PricingPage, { metadata } from "@/app/pricing/page";
import { LocaleProvider } from "@/i18n";
import { TIERS } from "@/lib/pricing";

function renderPricing() {
  return render(
    <LocaleProvider>
      <PricingPage />
    </LocaleProvider>,
  );
}

const COGNITO_ENV = {
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-2_TestPool",
  NEXT_PUBLIC_COGNITO_CLIENT_ID: "testclientid",
  NEXT_PUBLIC_COGNITO_DOMAIN: "auth.example.com",
  NEXT_PUBLIC_AWS_REGION: "us-east-2",
} as const;

function setAuthEnv(configured: boolean) {
  for (const [key, value] of Object.entries(COGNITO_ENV)) {
    if (configured) process.env[key] = value;
    else delete process.env[key];
  }
}

describe("PricingPage", () => {
  afterEach(() => setAuthEnv(false));

  it("exports canonical + Open Graph + Twitter metadata", () => {
    expect(metadata.title).toBe("Pricing");
    expect(metadata.alternates?.canonical).toBe("/pricing");
    const og = metadata.openGraph as Record<string, unknown>;
    expect(og.url).toBe("/pricing");
    expect(og.type).toBe("website");
    const twitter = metadata.twitter as Record<string, unknown>;
    expect(twitter.card).toBe("summary");
    // Public funnel route: must never inherit the walled pages' noindex.
    expect(metadata.robots).toBeUndefined();

    // The three descriptions must agree — and asserting only that they agree is what
    // let a false one ship: `og.description === metadata.description` touches the
    // string without reading a word of it, so the sentence "one credit wallet METERS
    // the only two things that cost real money" satisfied it while nothing on the
    // platform metered anything. So read what it says. Future tense on the metering,
    // and the not-yet status stated, because this is the sentence Google and every
    // share card quote to people who have not opened the page.
    const description = metadata.description ?? "";
    expect(og.description).toBe(description);
    expect(twitter.description).toBe(description);
    expect(description).toMatch(/\bfree\b/i);
    expect(description).toMatch(/\b(will meter|nothing is metered|not metered)\b/i);
    // (The claim-pattern scan over the whole metadata export lives in the copy-honesty
    // block below; this asserts the shape the page depends on.)
  });

  it("leads with the free-learning thesis", () => {
    renderPricing();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("The learning is");
    expect(h1.textContent).toContain("free");
    // Asserted as a SHAPE, not a fixed string. Pinning the exact sentence is how
    // ". The metal is metered." — present tense, over a sponsored allowance, in the
    // largest text on the page — survived five rounds of copy audit: every round read
    // this line as coverage. The h1 must not claim metering happens today.
    expect(h1.textContent).toMatch(/metal will be metered|metal is not metered/i);
    expect(h1.textContent).not.toMatch(/metal is metered/i);
    expect(screen.getByText("1 credit = $0.01")).toBeInTheDocument();
    expect(screen.getByText("Top up from $5")).toBeInTheDocument();
  });

  it("renders all three tiers with launch prices", () => {
    renderPricing();
    for (const name of ["Free", "Plus", "Pro"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    // Derived from TIERS, not hardcoded: a reprice should not require editing this test.
    // It shipped as literal "$18"/"$59" and broke on the 2026-08 reprice, which is the
    // failure mode this assertion now exists to prevent.
    for (const tier of TIERS.filter((t) => t.priceUsdPerMonth > 0)) {
      expect(screen.getByText(`$${tier.priceUsdPerMonth}`)).toBeInTheDocument();
    }
    expect(screen.getByText("Best for regulars")).toBeInTheDocument();
    // Paid tiers are not purchasable yet — both must say so.
    expect(screen.getAllByText("Launching soon")).toHaveLength(2);
  });

  it("carries the early-access honesty note (no hardware runs, free tutor today)", () => {
    renderPricing();
    const note = screen.getByText(/billing has not launched yet/i);
    expect(note.parentElement?.textContent).toMatch(/hardware runs are not currently available/i);
    expect(note.parentElement?.textContent).toMatch(/tutor is free to try/i);
  });

  it("switches to live checkout + custom top-up when billing is configured", () => {
    setAuthEnv(true);
    process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
    try {
      renderPricing();
      // Paid tiers become real checkout buttons; the teaser is gone.
      expect(screen.getByRole("button", { name: "Get Plus" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get Pro" })).toBeInTheDocument();
      expect(screen.queryByText("Launching soon")).not.toBeInTheDocument();
      // The custom top-up is offered, honoring the published bounds.
      expect(screen.getByText("Top up any amount")).toBeInTheDocument();
      expect(screen.getByLabelText("Custom amount (USD)")).toBeInTheDocument();
      // The honesty note flips to the live-transition wording.
      expect(screen.queryByText(/billing has not launched yet/i)).not.toBeInTheDocument();
      expect(screen.getByText(/wallets are live/i)).toBeInTheDocument();
      // The FAQ answers "how", not "when".
      expect(screen.getByText("How do I buy credits?")).toBeInTheDocument();
      expect(screen.queryByText("When can I buy credits?")).not.toBeInTheDocument();
    } finally {
      delete process.env.NEXT_PUBLIC_BILLING_URL;
    }
  });

  it("gates sign-up CTAs on the Cognito env (configured)", () => {
    setAuthEnv(true);
    renderPricing();
    const signups = screen.getAllByRole("link", { name: "Sign up free" });
    expect(signups.length).toBeGreaterThanOrEqual(2); // Free card + closing CTA
    for (const link of signups) {
      expect(link).toHaveAttribute("href", "/login?mode=signup");
    }
    expect(
      screen.getAllByRole("link", { name: "Start free while you wait" }).length
    ).toBe(2);
    expect(screen.queryByText("Sign-up coming soon")).not.toBeInTheDocument();
  });

  it("falls back to the coming-soon teaser when auth is not configured", () => {
    renderPricing();
    expect(screen.getAllByText("Sign-up coming soon").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("link", { name: "Sign up free" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Start free while you wait" })
    ).not.toBeInTheDocument();
  });

  it("publishes the full hardware and tutor rate tables", () => {
    renderPricing();
    // The estimator's <select> also lists device names; scope to table cells.
    for (const device of ["IonQ Forte-1", "IQM Garnet", "Rigetti Cepheus-1-108Q", "QuEra Aquila"]) {
      expect(
        screen.getAllByText(device).some((el) => el.closest("table") !== null)
      ).toBe(true);
    }
    expect(screen.getByText("SV1")).toBeInTheDocument();
    expect(screen.getByText("DM1")).toBeInTheDocument();
    for (const model of ["Claude Haiku", "Claude Sonnet", "Claude Opus", "Claude Fable"]) {
      expect(
        screen.getAllByText(model).some((el) => el.closest("table") !== null)
      ).toBe(true);
    }
  });

  it("answers the fair questions", () => {
    renderPricing();
    expect(screen.getByText("Do credits expire?")).toBeInTheDocument();
    expect(
      screen.getByText(/Why do backends cost such different amounts\?/)
    ).toBeInTheDocument();
    expect(screen.getByText(/When can I buy credits\?/)).toBeInTheDocument();
  });

  it("stays consistent with the account-gate story (never 'no account required')", () => {
    renderPricing();
    expect(screen.queryByText(/no account required/i)).not.toBeInTheDocument();
    expect(screen.getByText(/just a free account/i)).toBeInTheDocument();
  });
});

/**
 * Copy honesty — the storefront may not advertise a capability the deployed system
 * cannot perform.
 *
 * This guard asserts on RENDERED text, not on data. Its predecessor asserted on
 * `Tier.features` in lib/pricing.ts, which the page never read (it resolves
 * `pricingUi.{tier}F{i}` from the dictionaries instead), so the guard passed while the
 * live page sold model unlocks, wallet-billed QPU runs, and a priority hardware queue —
 * none of which exist anywhere in the repo. Reading `container.textContent` means a
 * false claim reintroduced through EITHER the tier data or the dictionaries reddens
 * here, which is the whole point.
 *
 * It renders EVERY shipped locale. Spanish is a shipped storefront locale, and the only
 * other coverage it had was the i18n parity test, which asserts a key resolves to
 * non-empty text and never reads what that text says — so a false claim written into
 * es.ts alone used to ship green.
 *
 * It also scans the page's `metadata` EXPORT, not only the rendered tree. Reading
 * `container.textContent` covers exactly what React renders into the body; the
 * description Next.js emits into <meta name="description">, og:description and
 * twitter:description never enters that tree, so for four rounds it was scanned by
 * nothing. The false claim that survived all four ("one credit wallet METERS the only
 * two things that cost real money") lived there, being served to Google and to every
 * share card, while the same sentence was found and deleted from the dictionaries. Two
 * shipping surfaces, one of them guarded, is how a green run kept being mistaken for
 * clearance — so the same patterns now run over both.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARD DOES NOT CATCH — read this before trusting a green run.
 *
 * It is a denylist of phrasings, run over two surfaces (rendered body, metadata
 * export). A denylist cannot be complete, and a passing run is NOT evidence that the
 * page is honest. Specifically it will miss:
 *
 *   - Any reworded claim. The patterns below aim at capability CONCEPTS rather than the
 *     exact sentences that were removed, which widens them, but a synonym or an unusual
 *     sentence shape still walks straight through. ("Front-of-line hardware scheduling"
 *     is caught; some phrasing nobody thought of is not.)
 *   - Claims made in a language whose vocabulary is not enumerated here. Both shipped
 *     locales are rendered, but the patterns must spell out both languages' words; a
 *     third locale would render with essentially no coverage until its terms are added.
 *     The metadata export is English-only and shipped once, so it gets English coverage
 *     only — a localized metadata export would arrive unguarded.
 *   - Any OTHER shipping surface. Two are covered, and the page ships more: the root
 *     layout's default/template metadata that Next merges over this export, the OG
 *     image itself, JSON-LD, sitemap and robots output, the Stripe checkout page's own
 *     product copy, and every other route (the welcome page and the lesson pages sell
 *     the same wallet). None of those is read here. Adding a surface to the product
 *     does not add it to this guard.
 *   - Non-textual claims. A capability implied by a control, a chip, a table column, or
 *     an icon has no words for `textContent` to catch. The "Tier" column removed below
 *     is exactly that failure, and it needed its own structural assertion.
 *   - Placement. A true sentence can still mislead by WHERE it renders: "Before you
 *     buy:" was accurate copy sitting after all three purchase controls, and a scan of
 *     `textContent` cannot see position. That one needed its own structural assertion
 *     (see the disclosure-ordering test below, which is now document-scoped because the
 *     section-scoped version did not examine a purchase control added outside its
 *     section at all) — assume the next placement defect will need one too.
 *   - Absolute promises. A sentence can be undeliverable by being unconditional rather
 *     than by naming a capability: "nothing else will ever cost credits" was a FREE
 *     promise a buyer could hold us to, contradicted by this page's own rate table. One
 *     pattern below bars that exact shape; the category is wide open, and note the
 *     direction — most patterns here bar overselling, and this one bars overpromising
 *     free, which review tends not to look for.
 *   - Arithmetic. The guard reads words, never numbers. That the estimator says 197
 *     credits ($1.97) where the pre-flight says $1.75 is invisible here; only the
 *     PHRASINGS that assert the two agree are barred, not the divergence itself. When
 *     wallet billing ships, the two tables must be reconciled and the pre-flight must
 *     display whichever number is actually charged — no regex will tell you that.
 *   - Anything true-sounding but stale: a claim that WAS true and quietly stopped being
 *     true only has a pattern here once somebody has noticed and written one. The
 *     parity, live-rate-feed and present-tense-metering patterns below were all added
 *     that way, after the fact — which is the point: they are proof the category
 *     exists, not proof it is covered.
 *   - Source comments and docs. A maintainer's docstring can assert the opposite of
 *     what these patterns bar (cost-estimator.tsx's did) and no test reads it.
 *
 * So this catches regressions of known-false claims on two of the page's surfaces.
 * Judging new copy is still a human job: check it against what the deployed Lambdas
 * actually do.
 * ---------------------------------------------------------------------------
 *
 * Adding a pattern: only bar a claim you have confirmed the code cannot deliver, and
 * say where you confirmed it. A claim that becomes true belongs out of this list, not
 * worked around.
 */
/** Words that assert entitlement, in both shipped languages. */
const ENTITLEMENT =
  "(?:includes?|included|access to|available (?:on|in|with)|incluye|incluid[oa]s?|acceso a|disponible (?:en|con))";
const TUTOR_MODEL = "(?:haiku|sonnet|opus|fable)";

/**
 * Either order inside ONE sentence: "Plus includes Opus" and "Opus, included with
 * Plus" are the same claim. The first draft of this pattern only matched the first
 * order, and "Claude Sonnet included in the tutor" passed it.
 */
const modelEntitlement = new RegExp(
  `\\b${ENTITLEMENT}\\b[^.!?]{0,60}\\b${TUTOR_MODEL}\\b` +
    `|\\b${TUTOR_MODEL}\\b[^.!?]{0,60}\\b${ENTITLEMENT}\\b`,
  "i",
);

/**
 * Metering asserted in the PRESENT tense. Nothing meters anything: lambda/tutor answers
 * every question on one hardcoded model and charges nothing, lambda/qpu grants no
 * allowance (LIFETIME_CAP_MICROS = 0) and refuses every submit it cannot fund, and no
 * code path outside lambda/stripe touches the wallet. So
 * every metering sentence on this page has to be future tense, and this is the pattern
 * the page metadata needed — its description read "one credit wallet METERS the only two
 * things that cost real money" for four review rounds.
 *
 * The lookbehinds are what make it usable: "will meter" / "would meter" is the honest
 * copy this page is full of, and matching a bare "meter(s)" without excluding those
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
const presentTenseMetering = new RegExp(
  `\\b(?:wallet|credits?)\\b[^.!?]{0,40}\\b(?<!\\b(?:will|would|shall|to|never)\\s)meters?\\b` +
    `|\\b(?:billetera|créditos?|saldo)\\b[^.!?]{0,40}\\b(?<!\\b(?:no|nada|tampoco|nunca|ni)\\s(?:se\\s)?)(?:mide|miden)\\b`,
  "i",
);

const UNDELIVERABLE_CLAIMS: { pattern: RegExp; why: string }[] = [
  {
    // The at-cost / no-markup framing. CLAUDE.md rules 5 and 9 retired it: every
    // metered surface debits at one shared factor over true cost, so "at cost" is
    // not what this page sells, and rule 6 forbids the repo from carrying the
    // spread that would make any such claim checkable. scripts/stripe/
    // check-catalog-parity.mjs already bars the same three phrasings on the Stripe
    // product descriptions; this is the same denylist pointed at the page.
    //
    // The Spanish arm anchors on "a costo" / "a precio de costo" rather than the
    // bare noun: es.ts is full of honest cost talk ("te muestra su costo", "el
    // costo exacto"), and a pattern that fired on those would redden truthful copy.
    pattern:
      /\b(at cost|cost price|no mark-?up|without mark-?up|sin (margen|recargo|sobreprecio)|a (precio de )?costo)\b/i,
    why: "at-cost/no-markup pricing: CLAUDE.md rules 5 and 9 retired that framing, and rule 6 keeps the spread out of this repo entirely",
  },
  {
    pattern: presentTenseMetering,
    why: "present-tense metering: the tutor charges nothing, the QPU lambda refuses unfunded submits, and nothing outside lambda/stripe reads the wallet",
  },
  {
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
    // lib/pricing.ts SIMULATOR_RATES publishes SV1 and DM1 at 8.4 credits/minute and
    // this page's own rate table renders both, so "credits will meter exactly two
    // things ... nothing else will ever cost credits" was contradicted a section later
    // by the page itself. Note the direction: this bars an absolute promise of FREE, a
    // claim a buyer can hold us to, not an oversell. It is the narrow shape only —
    // "everything else is free" phrased without the credit noun walks through.
    pattern:
      /\b(?:nothing|anything|everything) else\b[^.!?]{0,50}\b(?:credits?|cost|costs|charged?)\b|\bnada más\b[^.!?]{0,50}\b(?:cr[ée]ditos?|cuesta|costar[áa])\b/i,
    why: "blanket free promise: SIMULATOR_RATES publishes SV1/DM1 per minute in credits, in this page's own rate table",
  },
  {
    // The parity claim's other shape: not "the same estimate" but a definite article
    // pointing back at the credit figure the estimator just rendered — "The estimate is
    // always shown before you commit", in a paragraph about the published credit rate.
    // What a learner is actually shown before a run is qpu-budget.ts `costMicros` in
    // AWS dollars. The approval gate is real; the identity of the number is not.
    pattern:
      /\b(?:the|that|this) estimate\b[^.!?]{0,50}\bbefore you (?:commit|buy|pay|run|submit|approve)\b|\bla estimación\b[^.!?]{0,50}\bantes de (?:confirmar|comprar|pagar|ejecutar|aprobar|enviar)\b/i,
    why: "estimate parity by definite article: the number shown before a run is AWS dollars from qpu-budget.ts, not this page's credit figure",
  },
  {
    // lambda/tutor/index.mjs binds one process.env.TUTOR_MODEL_ID; ask-tutor.tsx posts
    // only {slug, question}. No model parameter, no tier lookup, no per-tier routing.
    pattern: /\b(unlock(ed|s|ing)?|desbloquea\w*)\b/i,
    why: "tutor model unlocks: the tutor takes no model parameter and no tier is consulted",
  },
  {
    // Same reason, said the other way round: a model presented as bundled with a plan.
    // Bounded to one sentence so it cannot span unrelated copy.
    pattern: modelEntitlement,
    why: "model entitlement: every question is answered by the one hardcoded tutor model",
  },
  {
    // lambda/qpu/qpu-core.mjs hardcodes DEVICE = "iqm_garnet".
    pattern: /any (quantum )?backend from your balance/i,
    why: "wallet-billed multi-backend runs: the QPU lambda is hardcoded to IQM Garnet",
  },
  {
    pattern: /choose the physics your budget/i,
    why: "backend selection: only IQM Garnet is submittable",
  },
  {
    // grep finds no queue, priority, or scheduling concept in lambda/qpu or infra.
    // Braket task submission is FIFO to the provider; we control nothing about it.
    pattern:
      /\b(priority|prioriti[sz]ed|front[- ]of[- ]line|skip the (line|queue)|prioridad|prioritari[oa]s?)\b/i,
    why: "priority/queue position: no queue or scheduling concept exists in the codebase",
  },
  {
    // Nothing reads quantum-stripe-wallet except lambda/stripe and the wallet badge.
    pattern: /early access to new backends|acceso anticipado a (nuevos )?backends/i,
    why: "backend early access: there is no per-tier backend gating",
  },
  {
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
    // Estimate parity. This page's estimator prices CREDITS from lib/pricing.ts
    // (IQM Garnet: 0.163 credits/shot + the 34-credit task fee = 197 credits for a
    // 1,000-shot run). The pre-flight a learner actually meets prices USD from
    // lib/qpu-budget.ts `costMicros`, whose rates come from PRICING.IQM in
    // components/quantum/cost.ts ($0.30/task + $0.00145/shot = $1.75) — a different
    // table, a different currency, ~12.6% apart. Two of the eight backends priced here
    // are not even submittable, so for those no "real submission" exists to precede.
    // Retire this pattern only when one table feeds both surfaces.
    pattern:
      /\b(the |that |this )?(same|identical|misma|mismo|idéntic[oa])\b[^.!?]{0,25}\b(estimate|estimation|quote|number|figure|price|estimación|cotización|cifra|número|precio)\b|\b(estimate|estimación)\b[^.!?]{0,40}\b(matches|is the same|coincide|es la misma)\b/i,
    why: "estimate parity: the page prices credits, the pre-flight prices AWS dollars — different tables",
  },
  {
    // A live rate feed. lib/pricing.ts is a hardcoded array stamped `PRICES_AS_OF`, and
    // components/quantum/cost.ts is a hardcoded const; both compile into the static
    // export. Nothing anywhere fetches a provider rate, at submission time or ever — a
    // reprice takes a code change and a redeploy.
    pattern:
      /\b(live|real[- ]?time|up[- ]to[- ]the[- ]minute|en vivo|en tiempo real)\b[^.!?]{0,40}\b(rates?|prices?|pricing|tarifas?|precios?)\b|\b(rates?|prices?|estimate|tarifas?|precios?|estimación)\b[^.!?]{0,50}\b(at submission time|in real[- ]?time|automatically|al momento del envío|en tiempo real|vigente|automáticamente)\b/i,
    why: "live rate feed: both rate tables are hardcoded constants compiled into the static export",
  },
];

/** Shipped storefront locales — the guard must read every one of them. */
const SHIPPED_LOCALES = ["en", "es"] as const;

/**
 * Every string the `metadata` export ships, flattened depth-first with its path.
 *
 * Recursive on purpose: `description`, `openGraph.description` and `twitter.description`
 * are the three that matter today, but Next.js metadata grows sideways (openGraph.images
 * carry alt text, `keywords` is an array, `other` is free-form), and a scan that
 * enumerated today's three keys by hand would silently skip whatever gets added next.
 * The path is carried so a failure names the field that has to change.
 */
function metadataStrings(value: unknown, path = "metadata"): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value))
    return value.flatMap((v, i) => metadataStrings(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => metadataStrings(v, `${path}.${k}`));
  return [];
}

describe("PricingPage copy honesty", () => {
  afterEach(() => {
    setAuthEnv(false);
    localStorage.clear();
  });

  /** Render the page in one locale, tearing down any previous tree first. */
  function renderPricingIn(locale: (typeof SHIPPED_LOCALES)[number]) {
    cleanup();
    localStorage.setItem("qc:locale", locale);
    return renderPricing();
  }

  /**
   * `locale` is really "which surface" — a locale code for the rendered scans, a
   * metadata path for the export scan — so a failure says where to go.
   *
   * Every pattern is evaluated before asserting, rather than one expect per pattern.
   * Failing on the first match reports one pattern and hides the rest, and the first to
   * fire is not necessarily the one whose `why` names the real defect: reintroducing
   * the blanket "Nada más costará créditos jamás" reported the present-tense-metering
   * pattern instead, which would have sent a maintainer after the wrong root cause.
   */
  function assertNoUndeliverableClaims(text: string, locale: string) {
    const advertised = UNDELIVERABLE_CLAIMS.flatMap(({ pattern, why }) => {
      const hit = text.match(pattern);
      return hit ? [`[${locale}] advertised "${hit[0]}" — ${why}`] : [];
    });
    expect(advertised).toEqual([]);
  }

  it("advertises no capability the deployed system cannot perform in the METADATA export", () => {
    // The surface no rendered-text scan can reach. These strings never enter the React
    // tree; Next.js emits them into <meta name="description">, og:description and
    // twitter:description, which is what a search result and a share card quote — so
    // this is the copy most people read, and it was the only copy nothing checked.
    const strings = metadataStrings(metadata);
    // Non-vacuity: if the export is ever restructured so the descriptions stop being
    // plain strings, this must fail loudly rather than scan an empty list and pass.
    const described = strings.filter(({ path }) => /description$/i.test(path));
    expect(described.map(({ path }) => path).sort()).toEqual([
      "metadata.description",
      "metadata.openGraph.description",
      "metadata.twitter.description",
    ]);
    for (const { path, text } of strings) assertNoUndeliverableClaims(text, path);
  });

  it.each(SHIPPED_LOCALES)(
    "advertises no capability the deployed system cannot perform (billing closed, %s)",
    (locale) => {
      const { container } = renderPricingIn(locale);
      assertNoUndeliverableClaims(container.textContent ?? "", locale);
    },
  );

  it.each(SHIPPED_LOCALES)(
    "advertises no capability the deployed system cannot perform (billing live, %s)",
    (locale) => {
      setAuthEnv(true);
      process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
      try {
        const { container } = renderPricingIn(locale);
        assertNoUndeliverableClaims(container.textContent ?? "", locale);
      } finally {
        delete process.env.NEXT_PUBLIC_BILLING_URL;
      }
    },
  );

  /**
   * The ban list itself is not inert — pinned so the question stops being
   * re-litigated. The 2026-08-19 changelog audit found its (differently built)
   * copy-honesty matcher evadable by two-clause prose — "X isn't metered yet,
   * but the wallet meters Y" — because that matcher judged only the FIRST regex
   * match and let a negated early mention exonerate a later affirmative one.
   * This file's matcher was then suspected of the same class, twice, by two
   * separate reviewers.
   *
   * It is not vulnerable, and the reason is structural, not luck: this matcher
   * never exonerates. `text.match(pattern)` fires on a match at ANY position,
   * and negation handling lives inside each pattern as an immediate-word
   * lookbehind (`will meter`, `no se mide`), so a negated clause suppresses
   * only itself — the regex engine walks past it to any later affirmative use.
   * These cases hold that property in place; if someone ever "simplifies" the
   * matcher into a first-match-with-window shape, they go red.
   *
   * Known, accepted residual (shared by every regex denylist including the
   * changelog's rebuilt one): a pronoun across a sentence boundary — "You hold
   * one wallet. It meters both surfaces." — is invisible, because every pattern
   * anchors on the noun. Human review owns that case.
   */
  describe("the ban list survives negate-then-claim prose", () => {
    // Looked up by identity, not by index: the list is ordered for readability and
    // a new entry at the front used to silently re-point this at another pattern.
    const meteringPattern = UNDELIVERABLE_CLAIMS.find(
      (c) => c.pattern === presentTenseMetering,
    )!.pattern;
    const entitlementPattern = UNDELIVERABLE_CLAIMS.find(
      (c) => c.pattern === modelEntitlement,
    )!.pattern;

    it("is scanning the patterns it thinks it is (non-vacuity)", () => {
      expect(meteringPattern).toBe(presentTenseMetering);
      expect(entitlementPattern).toBe(modelEntitlement);
    });

    it.each([
      ["Nothing is metered today, but your wallet meters every tutor question."],
      ["Your wallet will meter tutor questions, and it meters QPU runs today."],
      ["Hoy no se mide nada, pero la billetera mide cada pregunta."],
    ])("still fires when an honest negation precedes the claim: %s", (text) => {
      expect(meteringPattern.test(text)).toBe(true);
    });

    it("still fires on negate-then-claim entitlement across sentences", () => {
      expect(
        entitlementPattern.test("No plan includes Opus today. Plus includes Opus at launch."),
      ).toBe(true);
    });

    /**
     * The at-cost pattern, held against the sentence that actually shipped — a
     * denylist entry nobody has fired once is a comment, not a guard.
     */
    describe("the at-cost pattern", () => {
      const atCost = UNDELIVERABLE_CLAIMS.find((c) =>
        c.pattern.test("billed at cost with no markup"),
      )!.pattern;

      it.each([
        ["One credit wallet will meter real quantum hardware, billed at cost with no markup."],
        ["Hardware runs are billed at cost."],
        ["Sold with no mark-up over what the provider charges."],
        ["El hardware se cobra a precio de costo, sin margen."],
      ])("fires on the retired framing: %s", (text) => {
        expect(atCost.test(text)).toBe(true);
      });

      it.each([
        // Honest cost talk in both locales, which the page is full of.
        ["The workspace shows you its cost and makes you approve it."],
        ["El espacio de trabajo te muestra su costo y te hace aprobarlo."],
        ["Te muestra el costo exacto de cualquier ejecución de hardware."],
      ])("stays silent on honest cost talk: %s", (text) => {
        expect(atCost.test(text)).toBe(false);
      });
    });

    it.each([
      ["Your wallet will meter the only two things that cost real money."],
      ["Credits never meter anything on the free tier."],
      // The documented Spanish trap that once false-positived a truthful sentence.
      ["Nada más costará créditos jamás — y hoy tampoco se mide ninguna de esas dos."],
    ])("stays silent on honest copy: %s", (text) => {
      expect(meteringPattern.test(text)).toBe(false);
    });
  });

  it.each(SHIPPED_LOCALES)(
    "frames the tutor model chips as a forecast, not a purchasable selection (%s)",
    (locale) => {
      // FINDING 2: clicking a chip changes the price, which reads as buying a model.
      // The not-yet disclosure must render BEFORE the chips in document order — a buyer
      // meets it on the way to the control, not a section later.
      const { container } = renderPricingIn(locale);
      const group = container.querySelector('[role="group"][aria-label*="odel"]');
      expect(group).not.toBeNull();
      const disclosure = group!.previousElementSibling;
      expect(disclosure?.textContent ?? "").toMatch(/haiku/i);
      expect(disclosure?.textContent ?? "").toMatch(
        locale === "es" ? /todavía no se puede elegir/i : /not selectable yet/i,
      );
    },
  );

  /** The disclosure's label, per shipped locale — the anchor the ordering test uses. */
  const DISCLOSURE_LABEL = {
    en: "Before you buy:",
    es: "Antes de comprar:",
  } as const;

  it.each(SHIPPED_LOCALES)(
    "renders the not-yet-metered disclosure BEFORE every purchase control on the page (billing live, %s)",
    (locale) => {
      // The label was renamed from "Launch pricing:" to "Before you buy:" without being
      // moved, so it rendered after Get Plus, Get Pro AND the top-up's buy button — a
      // label promising "before" that arrives after three buy buttons is worse than the
      // neutral one it replaced. What let that ship was an assertion that the text is
      // present ANYWHERE on the page, which position cannot fail. So assert position.
      setAuthEnv(true);
      process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
      try {
        const { container } = renderPricingIn(locale);
        const section = container.querySelector('[aria-labelledby="tiers-heading"]');
        expect(section).not.toBeNull();

        // Enumerated page-wide, NOT inside the tiers section. Scoping the query to the
        // section meant a CheckoutButton added to the closing CTA was not examined at
        // all — a purchase control outside the disclosure's section, and the test still
        // passed. Every control that opens a Stripe checkout carries `surface-accent`.
        const controls = Array.from(
          container.querySelectorAll<HTMLButtonElement>("button.surface-accent"),
        );
        // The two tier buttons and the top-up's. A floor rather than an exact count:
        // a fourth control must be checked, not merely counted. Locking it means the
        // anchor cannot go quietly empty and turn the checks below into a vacuous pass.
        expect(controls.length).toBeGreaterThanOrEqual(3);

        const disclosure = screen.getByText(DISCLOSURE_LABEL[locale]);
        const misordered = controls
          .filter(
            (c) =>
              !(
                disclosure.compareDocumentPosition(c) &
                Node.DOCUMENT_POSITION_FOLLOWING
              ),
          )
          .map((c) => c.textContent?.trim());
        expect(misordered).toEqual([]);

        // ...and every one of them sits inside the section the disclosure heads. Being
        // "after" the disclosure is nearly free on a long page — the closing CTA is
        // after everything, two rate tables and a FAQ away from the banner — so
        // document order alone would wave that through. A purchase control anywhere
        // else has to be a deliberate decision that brings its own disclosure, and
        // this is where that decision surfaces.
        const undisclosed = controls
          .filter((c) => !section!.contains(c))
          .map((c) => c.textContent?.trim());
        expect(undisclosed).toEqual([]);

        // ...and the label still leads the body that carries the actual disclosure, so
        // moving the label alone cannot satisfy this either.
        expect(disclosure.parentElement?.textContent ?? "").toMatch(
          locale === "es" ? /todavía nada las descuenta/i : /nothing draws them down yet/i,
        );
      } finally {
        delete process.env.NEXT_PUBLIC_BILLING_URL;
      }
    },
  );

  it("discloses that credits buy nothing yet, in BOTH billing states", () => {
    // The paid tiers sell a credit grant while no code path debits the wallet. That is
    // only honest if the not-yet status is unmistakable next to the price, so the note
    // under the tier grid must carry it whether or not checkout is open.
    const { container: closed } = renderPricing();
    expect(closed.textContent).toMatch(/hardware runs are not currently available/i);
    expect(closed.textContent).toMatch(/tutor is free to try/i);

    setAuthEnv(true);
    process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
    try {
      const { container: live } = renderPricing();
      expect(live.textContent).toMatch(/nothing draws them down yet/i);
      expect(live.textContent).toMatch(/buys nothing today/i);
    } finally {
      delete process.env.NEXT_PUBLIC_BILLING_URL;
    }
  });

  it("publishes tutor rates without claiming a tier unlocks a model", () => {
    renderPricing();
    // The rate table's "Tier" column rendered a plus/pro chip beside Sonnet, Opus, and
    // Fable — an unlock claim in table form, which the text scan above cannot see.
    expect(screen.queryByRole("columnheader", { name: "Tier" })).not.toBeInTheDocument();
    // ...and the rates are labelled as not-yet-charged, naming the one live model.
    expect(screen.getByText(/once tutor metering ships/i)).toBeInTheDocument();
  });

  it("keeps every tier's rendered bullets equal to its featureKeys", () => {
    renderPricing();
    for (const tier of TIERS) {
      const heading = screen.getByRole("heading", {
        level: 3,
        name: tier.id === "free" ? "Free" : tier.name,
      });
      const card = heading.closest("div");
      const bullets = card?.querySelectorAll("ul > li") ?? [];
      // A bullet rendered from anywhere other than featureKeys (or a key that silently
      // resolves to nothing) shows up here as a count mismatch.
      expect(bullets.length).toBe(tier.featureKeys.length);
      for (const li of bullets) expect(li.textContent?.trim().length).toBeGreaterThan(0);
    }
  });
});
