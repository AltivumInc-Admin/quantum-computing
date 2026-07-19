import type { Metadata } from "next";
import Link from "next/link";
import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { GLOSSARY } from "@/lib/glossary";
import { isAuthConfigured } from "@/lib/auth-config";
import { pitchFor, ACCOUNT_REASSURANCE } from "@/lib/section-pitch";
import { SITE_NAME, OG_IMAGE } from "@/lib/site";
import { PALETTE } from "@/components/playground/palette";
import { CurriculumGrid } from "@/components/curriculum-grid";
import { WelcomeHero, type NodeGlyphName } from "@/components/welcome/hero";
import { Band, BandImage, type FeatureBandProps } from "@/components/welcome/band";
import { TutorMock } from "@/components/welcome/tutor-mock";

const HOME_TITLE = SITE_NAME;
const HOME_DESCRIPTION =
  "Learn quantum computing from first principles with Amazon Braket: a hands-on curriculum, a live circuit playground, real QPU access with transparent costs, and an AI tutor in the margin.";

export const metadata: Metadata = {
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  // Next.js REPLACES a page-level openGraph object (no deep-merge), so the
  // layout's siteName and structured image are spread back in from lib/site —
  // the most-shared URL on the site must not be the one route that drops
  // og:site_name and og:image:width/height/alt.
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    type: "website",
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

// Sign up / sign in pair, gated on the Cognito env vars exactly like the
// glossary WorkspaceCta: a live link when configured, a teaser otherwise.
function AuthCtas({ align = "start" }: { align?: "start" | "center" }) {
  const configured = isAuthConfigured();
  const justify = align === "center" ? "justify-center" : "";
  return (
    <div className={`flex flex-wrap items-center gap-3 ${justify}`}>
      {configured ? (
        <>
          <Link
            href="/login?mode=signup"
            className="surface-accent inline-flex items-center rounded-control px-6 py-3 text-base font-semibold interactive focus-ring"
          >
            Sign up free
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-control border border-white/20 px-6 py-3 text-base font-medium text-white hover:bg-white/5 hover:border-white/30 transition-colors interactive focus-ring"
          >
            Sign in
          </Link>
        </>
      ) : (
        <span className="inline-flex items-center rounded-control border border-white/15 px-6 py-3 text-base font-medium text-gray-300">
          Sign-up coming soon
        </span>
      )}
      <a
        href="#curriculum"
        className="inline-flex items-center px-2 py-3 text-base font-medium text-gray-300 hover:text-accent-light transition-colors interactive focus-ring rounded-control"
      >
        Explore the curriculum
        <svg
          className="ml-1.5 w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </a>
    </div>
  );
}

// The hero's floating constellation: four curriculum sections with label,
// glyph, and corner in ONE explicit config — no positional index agreement
// split across files. Slugs resolve against the live manifest below, and the
// home-page test pins all four labels + counts so a section rename fails
// loudly instead of silently emptying the flagship hero.
const HERO_NODES: {
  slug: string;
  label: string;
  glyph: NodeGlyphName;
  pos: "tl" | "tr" | "bl" | "br";
}[] = [
  { slug: "01-foundations", label: "Foundations", glyph: "atom", pos: "tl" },
  { slug: "02-hardware", label: "Hardware", glyph: "wave", pos: "tr" },
  { slug: "03-algorithms", label: "Algorithms", glyph: "branch", pos: "bl" },
  { slug: "05-quantum-chemistry", label: "Chemistry", glyph: "target", pos: "br" },
];

export default async function HomePage() {
  const sections = getSections();
  const summaries = await Promise.all(
    sections.map((s) => getContentSummary(s.slug))
  );
  const notebookTotal = sections.reduce((n, s) => n + s.notebookCount, 0);

  // The playground earns the third hero stat: the count of gates a visitor
  // can actually see there — the compose palette's chips, counted from the
  // same data module the playground renders (the test asserts the same sum).
  const playgroundGates = PALETTE.reduce((n, group) => n + group.chips.length, 0);

  const stats = [
    { value: sections.length, label: "curriculum sections" },
    { value: notebookTotal, label: "hands-on notebooks" },
    { value: playgroundGates, label: "gates in the live playground" },
  ];

  const heroNodes = HERO_NODES.flatMap((node) => {
    const section = sections.find((s) => s.slug === node.slug);
    return section
      ? [{ ...node, value: `${section.notebookCount} notebooks` }]
      : [];
  });

  const partners = ["Amazon Braket", "PennyLane", "IonQ", "IQM", "QuEra", "Rigetti"];

  const bands: FeatureBandProps[] = [
    {
      kicker: "Playground",
      title: "Sketch circuits, see the quantum state instantly",
      body: "Compose gates in a live editor and watch amplitudes, probabilities, and a publication-style circuit diagram redraw on every keystroke. Save circuits locally, share them by URL, and export standard OpenQASM whenever you want to leave.",
      href: "/playground",
      linkLabel: "Open the playground",
      visual: (
        <BandImage
          src="/welcome/circuit.webp"
          alt="Abstract quantum circuit drawn in light: luminous horizontal wires with glowing teal gate glyphs and one gold accent gate"
        />
      ),
    },
    {
      kicker: "Real hardware",
      title: "Graduate from simulator to real QPUs",
      body: "When an algorithm is ready, hand it off to real quantum processors through Amazon Braket. Every run shows a transparent cost estimate before you commit, and budget guardrails keep spending honest.",
      href: "/runbook",
      linkLabel: "Read the hardware runbook",
      visual: (
        <BandImage
          src="/welcome/hardware.webp"
          alt="Gold-plated dilution refrigerator of a superconducting quantum computer, rim-lit in teal against darkness"
        />
      ),
      flip: true,
    },
    {
      kicker: "Curriculum",
      title: "Learn by running real notebooks",
      body: `${notebookTotal} hands-on notebooks across ${sections.length} sections take you from your first qubit to production hybrid quantum-classical jobs. Most run directly in your browser — no installation, no setup, just a free account.`,
      href: "#curriculum",
      linkLabel: "Browse the learning path",
      visual: (
        <BandImage
          src="/welcome/bloch.webp"
          alt="Wireframe Bloch sphere of fine teal lines with a gold state-vector arrow, above faint interference ripples"
        />
      ),
    },
    {
      kicker: "AI tutor",
      title: "An AI tutor that knows exactly where you are",
      body: "Every lesson carries Ask the margin: press Cmd-K or Ctrl-K, ask what confuses you, and a Claude-powered tutor streams an answer grounded in the exact page you are reading — no tab-switching, no pasting context. Included free for every learner.",
      href: "#curriculum",
      linkLabel: "Meet it inside any lesson",
      visual: <TutorMock />,
      flip: true,
    },
  ];

  // The AI tutor graduated to its own feature band above, freeing this slot
  // for the in-lesson challenge graders.
  const toolkit = [
    {
      title: "Challenges that grade themselves",
      body: "Lessons end with hands-on checks — predict a measurement, debug a circuit, estimate a QPU bill — graded instantly in your browser, so you know an idea stuck before you build on it.",
      href: null,
    },
    {
      title: "Spaced-repetition review",
      body: "Key ideas become review cards automatically. A daily queue resurfaces each one right before you would forget it.",
      href: "/review",
    },
    {
      title: "A glossary that teaches",
      body: `${GLOSSARY.length} terms with precise definitions, rendered math, and links back to the lessons where each idea is built.`,
      href: "/glossary",
    },
  ];

  return (
    <div className="relative">
      {/* ------------------------------------------------------------------ */}
      {/* Hero — cinematic framed foggy-glass band (WelcomeHero). ---------- */}
      <WelcomeHero
        eyebrow="Learn quantum computing, hands-on"
        headlineLead="Master quantum computing"
        headlineDim="from first principles"
        subtitle="From circuit fundamentals to production hybrid workloads — a live playground, real quantum hardware, and an AI tutor in the margin. Free, right in your browser."
        ctas={<AuthCtas align="center" />}
        stats={stats}
        nodes={heroNodes}
        sectionCount={sections.length}
      />

      {/* Powered-by cloud — a quiet strip under the hero frame. */}
      <div className="dark bg-smoke px-3 sm:px-4">
        <div className="mx-auto max-w-6xl border-t border-white/[0.06] px-4 py-7">
          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
            {/* white/55 clears AA at these sizes on the smoke ground; the
                old /30 kicker composited to roughly 2.6:1. */}
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
              Powered by
            </span>
            {partners.map((p) => (
              <span key={p} className="text-sm font-medium text-white/55">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* What you can do here — four feature bands through one component.    */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
        <div className="absolute inset-0 bg-grid-dots-light dark:bg-grid-dots [mask-image:radial-gradient(ellipse_70%_50%_at_50%_50%,black,transparent)]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="flex items-center gap-4 mb-16 reveal">
            <h2 className="font-display text-display-xl text-(--ink)">
              One place to learn, build, and run
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
          </div>

          <div className="space-y-24">
            {bands.map((band) => (
              <Band key={band.kicker} {...band} />
            ))}
          </div>

          {/* Toolkit trio — the retention layer. */}
          <div className="mt-24 grid gap-5 sm:grid-cols-3 reveal">
            {toolkit.map((tool) => {
              const inner = (
                <>
                  <h3 className="font-display text-display-md text-(--ink)">
                    {tool.title}
                  </h3>
                  <p className="mt-2 text-sm text-(--mut) leading-relaxed">
                    {tool.body}
                  </p>
                </>
              );
              const chrome =
                "block h-full rounded-card glass p-6 shadow-(--shadow-resting)";
              return tool.href ? (
                <Link
                  key={tool.title}
                  href={tool.href}
                  className={`${chrome} interactive focus-ring hover:-translate-y-1 hover:shadow-(--shadow-raised) transition-all duration-300`}
                >
                  {inner}
                </Link>
              ) : (
                <div key={tool.title} className={chrome}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Account — the central sign up / sign in band.                       */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="account-heading"
        className="dark relative overflow-hidden bg-smoke border-y border-white/[0.06]"
      >
        {/* Match the hero's smoke: a warm fog bloom + faint grid over near-black,
            not the old cool navy. */}
        <div className="absolute inset-0 bg-atmosphere" />
        <div className="absolute inset-0 bg-grid-dots [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black,transparent)]" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[820px] h-[420px] bg-[radial-gradient(ellipse_at_center,rgba(230,228,214,0.10),transparent_65%)] rounded-full blur-[90px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center reveal">
          <p className="text-xs font-semibold tracking-widest uppercase text-accent-light mb-4">
            Your workspace
          </p>
          <h2
            id="account-heading"
            className="font-display text-display-xl tracking-tight text-white text-balance"
          >
            Create a free account, keep everything in sync
          </h2>
          <p className="mt-5 text-lg text-gray-300 leading-relaxed">
            One account carries your lesson progress, review cards, and saved circuits
            across devices — and opens the on-ramp to real quantum hardware when you are
            ready for it.
          </p>
          <div className="mt-9">
            <AuthCtas align="center" />
          </div>
          <p className="mt-6 text-sm text-gray-300">{ACCOUNT_REASSURANCE}</p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Learning path — the curriculum itself.                              */}
      {/* ------------------------------------------------------------------ */}
      <section id="curriculum" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="flex items-center gap-4 mb-10 reveal">
            <h2 className="font-display text-display-xl text-(--ink)">
              Learning Path
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
            <span className="text-sm text-caption tabular-nums">
              {sections.length} sections
            </span>
          </div>
          {/* Browsing is free for everyone; opening a section is where the
              sign-up gate lives (see CurriculumGrid). Each card carries its
              hand-written gate pitch alongside the content summary. */}
          <CurriculumGrid
            sections={sections.map((section, i) => {
              const summary = summaries[i] || "Hands-on lessons and exercises.";
              return {
                slug: section.slug,
                index: section.index,
                title: section.title,
                notebookCount: section.notebookCount,
                runnableCount: section.runnableCount,
                summary,
                pitch: pitchFor(section.slug, summary),
              };
            })}
          />
        </div>
      </section>
    </div>
  );
}
