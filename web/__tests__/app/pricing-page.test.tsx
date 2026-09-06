/**
 * @jest-environment jsdom
 */
// web/__tests__/app/pricing-page.test.tsx
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PricingPage, { metadata } from "@/app/pricing/page";
import { LocaleProvider, getDict, localeCode } from "@/i18n";
import { TIERS, CREDIT_USD, formatCreditNumber } from "@/lib/pricing";
import {
  UNDELIVERABLE_CLAIMS,
  modelEntitlement,
  presentTenseMetering,
  undeliverableClaimHits,
} from "../_support/undeliverable-claims";

// Only the network calls are stubbed. billingUrl/isBillingConfigured stay real
// so the env-gating tests below still exercise the actual gate; getWallet in
// particular decides whether a tier card shows checkout or the billing portal.
jest.mock("@/lib/billing-client", () => ({
  ...jest.requireActual("@/lib/billing-client"),
  getWallet: jest.fn().mockRejectedValue(new Error("401")),
  openPortal: jest.fn(),
  startCheckout: jest.fn(),
  startTopUp: jest.fn(),
}));
import { getWallet } from "@/lib/billing-client";

// Default for every test: no wallet answers, which is what a signed-out visitor
// gets. Reset per test rather than once, so a test that installs a subscriber
// cannot leak that wallet into the ones after it and quietly change which
// controls the tier cards render.
beforeEach(() => {
  (getWallet as jest.Mock).mockRejectedValue(new Error("401"));
});

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
    const badge = screen.getByText("Best for regulars");
    expect(badge).toBeInTheDocument();
    // The featured badge was bg-accent-dark + text-white with no dark: override.
    // .dark remaps --accent-dark to the light theme's raw --accent (#a38560),
    // where white computes 3.45:1 — under the AA floor for 12px text — and the
    // repo-wide contrast guard exempts bg-accent-dark, so nothing caught it.
    // chip-selected is the one sanctioned gold fill, pinned in both themes.
    expect(badge.className).toContain("chip-selected");
    expect(badge.className).not.toContain("text-white");
    expect(badge.className).not.toContain("bg-accent-dark");
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

  it("offers a subscriber the portal on their own tier, and checkout on the others", async () => {
    // The cards rendered CheckoutButton for Plus and Pro whenever billing was
    // live, regardless of who was looking, and /checkout consults hasPaidTier
    // only for mode "payment" — so an active Plus subscriber saw an enabled "Get
    // Plus" that opens Checkout for a SECOND Plus subscription. Meanwhile POST
    // /portal and openPortal() were fully built with no consumer in web/src, so
    // a subscriber had no on-site way to change or cancel.
    setAuthEnv(true);
    process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
    (getWallet as jest.Mock).mockResolvedValue({
      tier: "plus",
      credits: 1890,
      subscriptionStatus: "active",
    });
    try {
      renderPricing();
      expect(await screen.findByText("Current plan")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Get Plus" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
      // The upgrade is still purchasable.
      expect(screen.getByRole("button", { name: "Get Pro" })).toBeInTheDocument();
    } finally {
      delete process.env.NEXT_PUBLIC_BILLING_URL;
    }
  });

  it("shows both buy buttons when no wallet answers (signed out)", async () => {
    setAuthEnv(true);
    process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
    (getWallet as jest.Mock).mockRejectedValue(new Error("401"));
    try {
      renderPricing();
      await waitFor(() => expect(getWallet).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Get Plus" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get Pro" })).toBeInTheDocument();
      expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
    } finally {
      delete process.env.NEXT_PUBLIC_BILLING_URL;
    }
  });

  it("acknowledges a cancelled checkout on the page Stripe returns to", () => {
    // cancel_url is `${siteOrigin}/pricing?checkout=cancelled`, and nothing in
    // web/src read the parameter — so backing out of Checkout dropped the learner
    // back here on a page indistinguishable from a fresh visit.
    window.history.replaceState({}, "", "/pricing?checkout=cancelled");
    try {
      renderPricing();
      expect(screen.getByTestId("checkout-cancelled")).toHaveTextContent(
        /nothing was charged/i,
      );
    } finally {
      window.history.replaceState({}, "", "/pricing");
    }
  });

  it("shows no checkout notice on an ordinary visit", () => {
    renderPricing();
    expect(screen.queryByTestId("checkout-cancelled")).not.toBeInTheDocument();
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

  it("names both rate tables, and lets a keyboard reach the wide one", () => {
    // Two bare <table>s with no caption and no aria-labelledby are two anonymous
    // entries in a screen reader's table list — the one place a reader chooses
    // between them. And the hardware table is min-w-[480px] inside an
    // overflow-x-auto div, so on a phone that scroller is the ONLY way to reach
    // the per-shot and 1,000-shot columns; a bare div cannot take focus, so in
    // Safari a keyboard-only reader could not scroll it at all.
    renderPricing();
    const named = screen
      .getAllByRole("table")
      .map((table) => table.getAttribute("aria-labelledby"))
      .map((id) => (id ? document.getElementById(id)?.textContent?.trim() : null));
    expect(named).toEqual(["AI tutor", "Quantum hardware"]);

    const scroller = screen.getByRole("region", { name: "Quantum hardware" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.className).toContain("focus-ring");
    expect(scroller.querySelector("table")).not.toBeNull();
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
 * THE BAN LIST ITSELF NOW LIVES IN __tests__/_support/undeliverable-claims.ts, shared
 * with the hardware-surface guard. It was a `const` in this file, which meant it
 * guarded exactly one route: the at-cost clause retired from this page in 2026-09
 * (commit d216724) went on shipping in six places on the two HARDWARE money surfaces,
 * because nothing over there imported it. Read that file for the patterns, the
 * evidence behind each one, and the long list of what a denylist cannot catch. What
 * stays here is what is specific to this PAGE.
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
 * Two of this page's surfaces are covered; the page ships more. The root layout's
 * default/template metadata that Next merges over this export, the OG image itself,
 * JSON-LD, sitemap and robots output, and the Stripe checkout page's own product copy
 * are all read by nothing here. Placement is likewise invisible to a text scan — "Before
 * you buy:" was accurate copy sitting after all three purchase controls — which is why
 * the disclosure-ordering test below is structural and document-scoped rather than a
 * phrase check.
 */

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
   * The shared matcher evaluates EVERY pattern before this asserts, rather than one
   * expect per pattern: failing on the first match reports one pattern and hides the
   * rest, and the first to fire is not necessarily the one whose `why` names the real
   * defect — reintroducing the blanket "Nada más costará créditos jamás" reported the
   * present-tense-metering pattern instead, which would have sent a maintainer after
   * the wrong root cause. That property is documented on `undeliverableClaimHits`;
   * keep it there rather than reimplementing the loop here.
   */
  function assertNoUndeliverableClaims(text: string, locale: string) {
    expect(undeliverableClaimHits(text, locale)).toEqual([]);
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

  it("renders no English credit unit inside the Spanish page (billing live)", () => {
    // formatCredits() appended the English word with en-US grouping and was the only
    // path to a credit figure on the page, so the Spanish storefront read "1,900
    // credits cada mes", "1,664 credits" in the rate table and "Comprar 2,000
    // credits" on the buy button — on its most number-dense surface. Billing live so
    // the top-up widget and its buy button are mounted too.
    setAuthEnv(true);
    process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
    try {
      const { container } = renderPricingIn("es");
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\d\s*credits?\b/i);
      // Non-vacuity: the figures ARE rendered, with the translated unit.
      expect(text).toMatch(/\d\s*créditos\b/);
    } finally {
      delete process.env.NEXT_PUBLIC_BILLING_URL;
    }
  });

  it.each(SHIPPED_LOCALES)(
    "keeps every tier's rendered bullets equal to its featureKeys (%s)",
    (locale) => {
      renderPricingIn(locale);
      for (const tier of TIERS) {
        const heading = screen.getByRole("heading", {
          level: 3,
          name: tier.id === "free" ? (locale === "es" ? "Gratis" : "Free") : tier.name,
        });
        const card = heading.closest("div");
        const bullets = Array.from(card?.querySelectorAll("ul > li") ?? []);
        // A bullet rendered from anywhere other than featureKeys (or a key that
        // silently resolves to nothing) shows up here as a count mismatch.
        expect(bullets.length).toBe(tier.featureKeys.length);
        for (const li of bullets) expect(li.textContent?.trim().length).toBeGreaterThan(0);

        // Every grouped figure on a paid card's bullets must be the tier's own
        // grant. plusF1 and proF1 spelled "1,900" and "6,500" into i18n copy in
        // both locales, beside the grant line the card renders from TIERS, and the
        // guard here counted <li>s without reading one — so a reprice shipped a
        // card showing two different grants, green.
        if (tier.monthlyCredits > 0) {
          const grant = formatCreditNumber(tier.monthlyCredits, localeCode(locale));
          for (const li of bullets) {
            for (const figure of li.textContent?.match(/\d[\d,]*\b/g) ?? []) {
              // Percentages are derived from TIERS too, and are checked below.
              if (li.textContent?.includes(`${figure}%`)) continue;
              expect(figure).toBe(grant);
            }
          }
        }
      }
    },
  );

  it.each(SHIPPED_LOCALES)(
    "only claims a bonus over pay-as-you-go where the grant actually beats its price (%s)",
    (locale) => {
      // The claim is arithmetic over two figures this page publishes, so it can go
      // stale silently: "a 10% bonus" was hand-computed into both dictionaries. If a
      // reprice takes a tier to parity, the sentence has to stop being rendered, not
      // quietly become "a 0% bonus".
      renderPricingIn(locale);
      for (const tier of TIERS) {
        const heading = screen.getByRole("heading", {
          level: 3,
          name: tier.id === "free" ? (locale === "es" ? "Gratis" : "Free") : tier.name,
        });
        const text = heading.closest("div")?.textContent ?? "";
        if (!/bonus|bonificaci[óo]n/i.test(text)) continue;
        const bonus = Math.round(
          ((tier.monthlyCredits * CREDIT_USD) / tier.priceUsdPerMonth - 1) * 100,
        );
        expect(bonus).toBeGreaterThan(0);
        expect(text).toContain(`${bonus}%`);
      }
    },
  );

  it("states no grouped credit figure as raw dictionary copy", () => {
    // The other half of the same defect: the number must reach the page through
    // TIERS, never through a translator's fingers. A dictionary string carrying a
    // grouped thousands figure is a second source of truth by construction.
    for (const locale of SHIPPED_LOCALES) {
      const pricingUi = (getDict(locale) as Record<string, unknown>)
        .pricingUi as Record<string, unknown>;
      const leaves = JSON.stringify(pricingUi);
      const grouped = leaves.match(/\b\d{1,3},\d{3}\b/g) ?? [];
      expect(grouped).toEqual([]);
    }
  });
});
