/**
 * @jest-environment jsdom
 */
// web/__tests__/app/home-page.test.tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import HomePage, { metadata } from "@/app/page";
import { getSections } from "@/lib/sections";
import { GLOSSARY } from "@/lib/glossary";
import { PALETTE } from "@/components/playground/compose-panel";

jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
jest.mock("@/lib/content", () => ({
  __esModule: true,
  getContentSummary: jest.fn().mockResolvedValue("Hands-on lessons."),
}));

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

async function renderHome() {
  render(await HomePage());
}

describe("HomePage (welcome page)", () => {
  afterEach(() => setAuthEnv(false));

  it("exports SEO metadata describing the platform", () => {
    expect(String(metadata.description)).toMatch(/quantum computing/i);
    expect(String(metadata.description)).toMatch(/braket/i);
  });

  it("renders the hero headline and eyebrow", async () => {
    await renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: /master quantum computing from first principles/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/amazon braket learning platform/i)).toBeInTheDocument();
  });

  it("shows sign up and sign in CTAs in the hero AND the central account band when auth is configured", async () => {
    setAuthEnv(true);
    await renderHome();
    const signUps = screen.getAllByRole("link", { name: /sign up free/i });
    expect(signUps).toHaveLength(2);
    for (const link of signUps) {
      expect(link).toHaveAttribute("href", "/login?mode=signup");
    }
    const signIns = screen.getAllByRole("link", { name: /^sign in$/i });
    expect(signIns).toHaveLength(2);
    for (const link of signIns) {
      expect(link).toHaveAttribute("href", "/login");
    }
    expect(
      screen.getByRole("heading", { name: /create a free account, keep everything in sync/i })
    ).toBeInTheDocument();
  });

  it("falls back to a coming-soon teaser with no signup link when auth is not configured", async () => {
    setAuthEnv(false);
    await renderHome();
    expect(screen.getAllByText(/sign-up coming soon/i)).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /sign up free/i })).not.toBeInTheDocument();
  });

  it("describes the platform pillars with links to each surface", async () => {
    await renderHome();
    expect(screen.getByRole("link", { name: /open the playground/i })).toHaveAttribute(
      "href",
      "/playground"
    );
    expect(screen.getByRole("link", { name: /read the hardware runbook/i })).toHaveAttribute(
      "href",
      "/runbook"
    );
    expect(screen.getByRole("link", { name: /spaced-repetition review/i })).toHaveAttribute(
      "href",
      "/review"
    );
    expect(screen.getByRole("link", { name: /a glossary that teaches/i })).toHaveAttribute(
      "href",
      "/glossary"
    );
  });

  it("renders every curriculum section card plus the glossary card at #curriculum", async () => {
    await renderHome();
    const sections = getSections();
    for (const section of sections) {
      expect(
        screen.getByRole("link", { name: new RegExp(section.title, "i") })
      ).toHaveAttribute("href", `/learn/${section.slug}`);
    }
    expect(
      screen.getByRole("link", { name: /glossary, an a to z reference/i })
    ).toHaveAttribute("href", "/glossary");
    expect(document.getElementById("curriculum")).toBeInTheDocument();
  });

  it("derives hero stats from the real content sources", async () => {
    await renderHome();
    const sections = getSections();
    const notebookTotal = sections.reduce((n, s) => n + s.notebookCount, 0);
    expect(screen.getByText(String(notebookTotal))).toBeInTheDocument();
    // The third stat is the playground's gate count. It must equal what a
    // visitor can actually count there — the compose palette's chips — NOT
    // the DSL registry alone (which also holds the identity gate the palette
    // never surfaces). Adding a gate to either side without the other breaks
    // this on purpose.
    const paletteGates = PALETTE.reduce((n, group) => n + group.chips.length, 0);
    expect(paletteGates).toBe(10);
    expect(screen.getByText(String(paletteGates))).toBeInTheDocument();
    // The label appears twice by design: an sr-only <dt> plus the visible <dd>.
    expect(screen.getAllByText(/gates in the live playground/i)).toHaveLength(2);
    // The glossary count moved out of the hero but still appears on its
    // toolkit card, sourced from the real glossary.
    expect(screen.getByText(new RegExp(`${GLOSSARY.length} terms`))).toBeInTheDocument();
  });

  it("presents the AI tutor band with honest included-free copy", async () => {
    await renderHome();
    expect(
      screen.getByRole("heading", { name: /an ai tutor that knows exactly where you are/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/included free for every learner/i)).toBeInTheDocument();
    // The real binding is metaKey OR ctrlKey — the copy must not be Mac-only.
    expect(screen.getByText(/press Cmd-K or Ctrl-K/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /meet it inside any lesson/i })).toHaveAttribute(
      "href",
      "#curriculum"
    );
  });

  it("keeps the curriculum band's promise consistent with the sign-up gate", async () => {
    await renderHome();
    // The gate asks signed-out visitors for an account before opening a
    // section, so the page must not simultaneously promise account-free entry.
    expect(screen.queryByText(/no account required/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/no installation, no setup, just a free account/i)
    ).toBeInTheDocument();
  });

  it("replaces the tutor toolkit card with the self-grading challenges card", async () => {
    await renderHome();
    expect(screen.getByText(/challenges that grade themselves/i)).toBeInTheDocument();
  });

  it("keeps the hero image decorative and gives feature imagery descriptive alt text", async () => {
    await renderHome();
    const images = Array.from(document.querySelectorAll("img"));
    const hero = images.find((img) => img.getAttribute("src") === "/welcome/hero.webp");
    expect(hero).toBeDefined();
    expect(hero).toHaveAttribute("aria-hidden", "true");
    expect(hero).toHaveAttribute("alt", "");
    for (const src of ["/welcome/circuit.webp", "/welcome/hardware.webp", "/welcome/bloch.webp"]) {
      const img = images.find((el) => el.getAttribute("src") === src);
      expect(img).toBeDefined();
      expect(img!.getAttribute("alt")!.length).toBeGreaterThan(20);
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });
});
