/**
 * @jest-environment jsdom
 */
// web/__tests__/app/home-page.test.tsx
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import HomePage, { metadata } from "@/app/page";
import { getSections } from "@/lib/sections";
import { GLOSSARY } from "@/lib/glossary";
import { SITE_NAME, OG_IMAGE } from "@/lib/site";
import { PALETTE } from "@/components/playground/palette";

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

  it("exports canonical + Open Graph + Twitter metadata", () => {
    expect(metadata.alternates?.canonical).toBe("/");
    const og = metadata.openGraph as Record<string, unknown>;
    expect(og.title).toBe(SITE_NAME);
    expect(og.url).toBe("/");
    expect(og.type).toBe("website");
    expect(og.description).toBe(metadata.description);
    // Next.js REPLACES (never merges) a page-level openGraph object, so the
    // home route must re-declare the layout's siteName and the STRUCTURED
    // image — losing width/height/alt here once shipped green (see A1-9).
    expect(og.siteName).toBe(SITE_NAME);
    const [image] = og.images as (typeof OG_IMAGE)[];
    expect(image).toEqual(OG_IMAGE);
    expect(image.url).toBe("/og.jpg");
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    expect(image.alt).toBeTruthy();
    const twitter = metadata.twitter as Record<string, unknown>;
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.description).toBe(metadata.description);
    expect(twitter.images as string[]).toContain("/og.jpg");
  });

  it("renders the hero headline and eyebrow", async () => {
    await renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: /master quantum computing from first principles/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/learn quantum computing, hands-on/i)).toBeInTheDocument();
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
    // The label appears twice in the DOM by design: an sr-only <dt> plus the
    // visible (aria-hidden) <dd> — screen readers announce it once.
    expect(screen.getAllByText(/gates in the live playground/i)).toHaveLength(2);
    // The glossary count moved out of the hero but still appears on its
    // toolkit card, sourced from the real glossary.
    expect(screen.getByText(new RegExp(`${GLOSSARY.length} terms`))).toBeInTheDocument();
  });

  it("pins all four constellation nodes to the live manifest (labels + notebook counts)", async () => {
    await renderHome();
    const sections = getSections();
    const expected: [string, string][] = [
      ["Foundations", "01-foundations"],
      ["Hardware", "02-hardware"],
      ["Algorithms", "03-algorithms"],
      ["Chemistry", "05-quantum-chemistry"],
    ];
    for (const [label, slug] of expected) {
      const section = sections.find((s) => s.slug === slug);
      // A renamed/renumbered manifest slug must fail HERE, loudly — the page
      // silently drops non-matching nodes and would unbalance the hero.
      expect(section).toBeDefined();
      const labelEl = screen.getByText(label);
      expect(labelEl).toBeInTheDocument();
      // The node's manifest-derived count sits right beside its label (the
      // same "N notebooks" string also appears on section cards, so scope
      // the assertion to the node's own container).
      expect(labelEl.parentElement!.textContent).toContain(
        `${section!.notebookCount} notebooks`
      );
    }
  });

  it("derives the horizons meter and scroll-cue counter from the real section count", async () => {
    await renderHome();
    const sections = getSections();
    // Horizons: one accent bar + (n-1) dim bars = one per section.
    const label = screen.getByText(/quantum horizons/i);
    // The bar row sits right after the label; one bar per section.
    const bars = label.nextElementSibling!.querySelectorAll("span");
    expect(bars).toHaveLength(sections.length);
    // The decorative chrome is hidden from assistive tech.
    expect(label.closest("[aria-hidden='true']")).not.toBeNull();
    // Scroll cue: a truthful accessible name, with the section-indexed
    // counter (01 / NN) demoted to aria-hidden decoration.
    const cue = screen.getByRole("link", { name: "Scroll to the curriculum" });
    expect(cue).toHaveAttribute("href", "#curriculum");
    expect(cue.textContent).toContain(
      `01 / ${String(sections.length).padStart(2, "0")}`
    );
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
    const hero = images.find((img) => img.getAttribute("src") === "/welcome/hero-fog.webp");
    expect(hero).toBeDefined();
    expect(hero).toHaveAttribute("aria-hidden", "true");
    expect(hero).toHaveAttribute("alt", "");
    // Responsive serving for the LCP-priority image: phones get the 960w cut.
    expect(hero).toHaveAttribute(
      "srcset",
      "/welcome/hero-fog-960.webp 960w, /welcome/hero-fog.webp 2688w"
    );
    expect(hero).toHaveAttribute("sizes", "100vw");
    for (const src of ["/welcome/circuit.webp", "/welcome/hardware.webp", "/welcome/bloch.webp"]) {
      const img = images.find((el) => el.getAttribute("src") === src);
      expect(img).toBeDefined();
      expect(img!.getAttribute("alt")!.length).toBeGreaterThan(20);
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });
});
