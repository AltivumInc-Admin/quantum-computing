/**
 * @jest-environment jsdom
 */
// web/__tests__/app/pricing-page.test.tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PricingPage, { metadata } from "@/app/pricing/page";

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
    expect(og.description).toBe(metadata.description);
    const twitter = metadata.twitter as Record<string, unknown>;
    expect(twitter.card).toBe("summary");
    // Public funnel route: must never inherit the walled pages' noindex.
    expect(metadata.robots).toBeUndefined();
  });

  it("leads with the free-learning thesis", () => {
    render(<PricingPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("The learning is");
    expect(h1.textContent).toContain("free");
    expect(h1.textContent).toContain("The metal is metered.");
    expect(screen.getByText("1 credit = $0.01")).toBeInTheDocument();
    expect(screen.getByText("Top up from $5")).toBeInTheDocument();
  });

  it("renders all three tiers with launch prices", () => {
    render(<PricingPage />);
    for (const name of ["Free", "Plus", "Pro"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(screen.getByText("$18")).toBeInTheDocument();
    expect(screen.getByText("$59")).toBeInTheDocument();
    expect(screen.getByText("Best for regulars")).toBeInTheDocument();
    // Paid tiers are not purchasable yet — both must say so.
    expect(screen.getAllByText("Launching soon")).toHaveLength(2);
  });

  it("carries the early-access honesty note (sponsored runs, free tutor today)", () => {
    render(<PricingPage />);
    const note = screen.getByText(/billing has not launched yet/i);
    expect(note.parentElement?.textContent).toMatch(/sponsored/i);
    expect(note.parentElement?.textContent).toMatch(/tutor is free to try/i);
  });

  it("switches to live checkout + custom top-up when billing is configured", () => {
    setAuthEnv(true);
    process.env.NEXT_PUBLIC_BILLING_URL = "https://billing.example.com";
    try {
      render(<PricingPage />);
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
    render(<PricingPage />);
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
    render(<PricingPage />);
    expect(screen.getAllByText("Sign-up coming soon").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("link", { name: "Sign up free" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Start free while you wait" })
    ).not.toBeInTheDocument();
  });

  it("publishes the full hardware and tutor rate tables", () => {
    render(<PricingPage />);
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
    render(<PricingPage />);
    expect(screen.getByText("Do credits expire?")).toBeInTheDocument();
    expect(
      screen.getByText(/Why do backends cost such different amounts\?/)
    ).toBeInTheDocument();
    expect(screen.getByText(/When can I buy credits\?/)).toBeInTheDocument();
  });

  it("stays consistent with the account-gate story (never 'no account required')", () => {
    render(<PricingPage />);
    expect(screen.queryByText(/no account required/i)).not.toBeInTheDocument();
    expect(screen.getByText(/just a free account/i)).toBeInTheDocument();
  });
});
