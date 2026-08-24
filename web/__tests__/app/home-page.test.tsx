/**
 * @jest-environment jsdom
 */
// web/__tests__/app/home-page.test.tsx
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import HomePage, { metadata } from "@/app/page";
import { getSections } from "@/lib/sections";
import { GLOSSARY } from "@/lib/glossary";
import { SITE_NAME, OG_IMAGE } from "@/lib/site";

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
  beforeEach(() => {
    // The playground mock reads the reduced-motion media query through
    // usePrefersReducedMotion; jsdom has no matchMedia. `matches: true`
    // keeps it on its static final frame, so assertions see the real
    // numbers without animation timing in the way.
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }) as unknown as typeof window.matchMedia;
  });
  afterEach(() => setAuthEnv(false));

  it("exports SEO metadata describing the platform", () => {
    expect(String(metadata.description)).toMatch(/quantum computing/i);
    expect(String(metadata.description)).toMatch(/braket/i);
    // Public funnel route: must never inherit the walled pages' noindex.
    expect(metadata.robots).toBeUndefined();
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

  it("renders the hero headline (with the gold |0⟩ ket) and kicker", async () => {
    await renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: /master quantum computing from \|0⟩ to production/i })
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
      // Two links may share the section's name now: its card and its dial
      // station. Every one of them must point at the section.
      const links = screen.getAllByRole("link", { name: new RegExp(section.title, "i") });
      expect(links.length).toBeGreaterThanOrEqual(1);
      for (const link of links) {
        expect(link).toHaveAttribute("href", `/learn/${section.slug}`);
      }
    }
    expect(
      screen.getByRole("link", { name: /glossary, an a to z reference/i })
    ).toHaveAttribute("href", "/glossary");
    expect(document.getElementById("curriculum")).toBeInTheDocument();
  });

  it("derives the dial HUD telemetry from the manifest and keeps its claims honest", async () => {
    await renderHome();
    const sections = getSections();
    const notebookTotal = sections.reduce((n, s) => n + s.notebookCount, 0);
    // The instrument-face HUD replaced the old CountUp stat row; its counts
    // still derive from the manifest so the decoration can never lie. (The
    // playground gate count left the hero with the dial redesign — the
    // palette-vs-registry cross-check lives with the playground.)
    const counts = screen.getByText(`${sections.length} sections · ${notebookTotal} notebooks`);
    expect(counts.closest("[aria-hidden='true']")).not.toBeNull();
    // The design kit's HUD read "QPU live" — hardware runs are not currently
    // available, so the shipped telemetry states the in-browser simulator
    // instead. This pin keeps the aspirational line from creeping back in.
    expect(screen.queryByText(/qpu live/i)).not.toBeInTheDocument();
    expect(screen.getByText(/simulator live · in-browser/i)).toBeInTheDocument();
    // The mono micro-badges under the CTAs.
    for (const badge of ["Free", "In-browser", "No install"]) {
      expect(screen.getByText(badge)).toBeInTheDocument();
    }
    // The glossary count moved out of the hero but still appears on its
    // toolkit card, sourced from the real glossary.
    expect(screen.getByText(new RegExp(`${GLOSSARY.length} terms`))).toBeInTheDocument();
  });

  it("engraves every curriculum section on the dial as a station control", async () => {
    await renderHome();
    const sections = getSections();
    // The stations are the one interactive hero layer: a labeled group of
    // controls, one per manifest section. Selecting one opens the blurb —
    // the blurb carries the real navigation.
    const dial = screen.getByRole("group", { name: /curriculum sections on the dial/i });
    const stations = within(dial).getAllByRole("button");
    expect(stations).toHaveLength(sections.length);
    for (const section of sections) {
      expect(within(dial).getByRole("button", { name: section.title })).toBeInTheDocument();
    }
    // Station 00 carries the resting gold hand's flag and its engraved short
    // name (the full manifest title stays the accessible name).
    expect(within(dial).getByText(/start here/i)).toBeInTheDocument();
    expect(
      within(dial).getByText(
        `${String(sections[0].index).padStart(2, "0")} · ${sections[0].title.split(":")[0]}`
      )
    ).toBeInTheDocument();
  });

  it("selecting a station opens its blurb with the summary and the section link", async () => {
    await renderHome();
    const sections = getSections();
    const target = sections[3];
    const dial = screen.getByRole("group", { name: /curriculum sections on the dial/i });
    // No blurb at rest — the needle merely rests on Start here.
    expect(screen.queryByRole("region", { name: target.title })).not.toBeInTheDocument();

    fireEvent.click(within(dial).getByRole("button", { name: target.title }));
    const blurb = screen.getByRole("region", { name: target.title });
    // The station reports the open blurb it controls.
    expect(within(dial).getByRole("button", { name: target.title })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    // The decision lives here: the module's manifest-derived count and the
    // one real link into the section.
    expect(within(blurb).getByText(`${target.notebookCount} notebooks`)).toBeInTheDocument();
    expect(within(blurb).getByRole("link")).toHaveAttribute("href", `/learn/${target.slug}`);

    // Escape closes it and the station stands down.
    fireEvent.keyDown(blurb, { key: "Escape" });
    expect(screen.queryByRole("region", { name: target.title })).not.toBeInTheDocument();
    expect(within(dial).getByRole("button", { name: target.title })).toHaveAttribute(
      "aria-expanded",
      "false"
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
    for (const src of ["/welcome/hardware.webp", "/welcome/bloch.webp"]) {
      const img = images.find((el) => el.getAttribute("src") === src);
      expect(img).toBeDefined();
      expect(img!.getAttribute("alt")!.length).toBeGreaterThan(20);
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });

  it("renders the playground band as a live, inert demo instead of a photo", async () => {
    await renderHome();
    // The old circuit photograph is gone — the band demonstrates the product.
    expect(
      document.querySelector('img[src="/welcome/circuit.webp"]')
    ).not.toBeInTheDocument();
    // The demo types real qsim source; under the reduced-motion mock it sits
    // on its finished frame, so all three program lines are visible...
    const editorLine = screen.getByText("CNOT");
    expect(editorLine).toBeInTheDocument();
    // ...and the probabilities are simulate()'s real output for the final
    // circuit (H 0 / CNOT 0 1 / RY 1 0.79): cos²(0.395)/2 ≈ 42.6% on |00⟩
    // and |11⟩, sin²(0.395)/2 ≈ 7.4% on |01⟩ and |10⟩.
    expect(screen.getAllByText("42.6%")).toHaveLength(2);
    expect(screen.getAllByText("7.4%")).toHaveLength(2);
    // The whole card is decoration: hidden from AT and — because the embedded
    // CircuitDiagram is normally focusable — inert, so keyboard users can
    // never land inside hidden content.
    const card = editorLine.closest("[aria-hidden='true']");
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute("inert");
  });
});
