import type { Metadata } from "next";
import Link from "next/link";
import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { GLOSSARY } from "@/lib/glossary";
import { isAuthConfigured } from "@/lib/auth-config";
import { pitchFor } from "@/lib/section-pitch";
import { SINGLE, ROT } from "@/components/quantum/qsim-dsl";
import { CurriculumGrid } from "@/components/curriculum-grid";
import { WelcomeHero } from "@/components/welcome/hero";

const HOME_TITLE = "Quantum Computing Workspace";
const HOME_DESCRIPTION =
  "Learn quantum computing from first principles with Amazon Braket: a hands-on curriculum, a live circuit playground, real QPU access with transparent costs, and an AI tutor in the margin.";

export const metadata: Metadata = {
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: ["/og.png"],
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

interface FeatureBand {
  kicker: string;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
  image: { src: string; alt: string };
  flip?: boolean;
}

export default async function HomePage() {
  const sections = getSections();
  const summaries = await Promise.all(
    sections.map((s) => getContentSummary(s.slug))
  );
  const notebookTotal = sections.reduce((n, s) => n + s.notebookCount, 0);

  // The playground earns the third hero stat: its gate count is derived from
  // the same DSL registry the editor parses — minus the identity gate, which
  // the palette never surfaces and QASM export drops as a physical no-op —
  // plus rotations and CNOT. The number therefore matches what a visitor can
  // actually count in the playground (the test couples it to the palette).
  const playgroundGates = SINGLE.size - 1 + ROT.size + 1;

  const stats = [
    { value: sections.length, label: "curriculum sections" },
    { value: notebookTotal, label: "hands-on notebooks" },
    { value: playgroundGates, label: "gates in the live playground" },
  ];

  // Four curriculum sections become the hero's floating constellation nodes —
  // real names + real notebook counts, placed at the four corners.
  const NODE_LABELS: Record<string, string> = {
    "01-foundations": "Foundations",
    "02-hardware": "Hardware",
    "03-algorithms": "Algorithms",
    "05-quantum-chemistry": "Chemistry",
  };
  const nodeCorners = ["tl", "tr", "bl", "br"] as const;
  const heroNodes = sections
    .filter((s) => s.slug in NODE_LABELS)
    .slice(0, 4)
    .map((s, i) => ({
      label: NODE_LABELS[s.slug],
      value: `${s.notebookCount} notebooks`,
      pos: nodeCorners[i],
    }));

  const partners = ["Amazon Braket", "PennyLane", "IonQ", "IQM", "QuEra", "Rigetti"];

  const bands: FeatureBand[] = [
    {
      kicker: "Playground",
      title: "Sketch circuits, see the quantum state instantly",
      body: "Compose gates in a live editor and watch amplitudes, probabilities, and a publication-style circuit diagram redraw on every keystroke. Save circuits locally, share them by URL, and export standard OpenQASM whenever you want to leave.",
      href: "/playground",
      linkLabel: "Open the playground",
      image: {
        src: "/welcome/circuit.webp",
        alt: "Abstract quantum circuit drawn in light: luminous horizontal wires with glowing teal gate glyphs and one gold accent gate",
      },
    },
    {
      kicker: "Real hardware",
      title: "Graduate from simulator to real QPUs",
      body: "When an algorithm is ready, hand it off to real quantum processors through Amazon Braket. Every run shows a transparent cost estimate before you commit, and budget guardrails keep spending honest.",
      href: "/runbook",
      linkLabel: "Read the hardware runbook",
      image: {
        src: "/welcome/hardware.webp",
        alt: "Gold-plated dilution refrigerator of a superconducting quantum computer, rim-lit in teal against darkness",
      },
      flip: true,
    },
    {
      kicker: "Curriculum",
      title: "Learn by running real notebooks",
      body: `${notebookTotal} hands-on notebooks across ${sections.length} sections take you from your first qubit to production hybrid quantum-classical jobs. Most run directly in your browser — no installation, no setup, just a free account.`,
      href: "#curriculum",
      linkLabel: "Browse the learning path",
      image: {
        src: "/welcome/bloch.webp",
        alt: "Wireframe Bloch sphere of fine teal lines with a gold state-vector arrow, above faint interference ripples",
      },
    },
  ];

  // The AI tutor graduated to its own feature band below, freeing this slot
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
      />

      {/* Powered-by cloud — a quiet strip under the hero frame. */}
      <div className="dark bg-[#0b0b0c] px-3 sm:px-4">
        <div className="mx-auto max-w-6xl border-t border-white/[0.06] px-4 py-7">
          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/30">
              Powered by
            </span>
            {partners.map((p) => (
              <span key={p} className="text-sm font-medium text-white/45">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* What you can do here — three image-led bands.                       */}
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
              <div
                key={band.kicker}
                className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center reveal"
              >
                <div className={band.flip ? "lg:order-2" : undefined}>
                  <p className="text-xs font-semibold tracking-[0.2em] uppercase text-accent dark:text-accent-light font-mono mb-3">
                    {band.kicker}
                  </p>
                  <h3 className="font-display text-display-lg text-(--ink) text-balance">
                    {band.title}
                  </h3>
                  <p className="mt-4 text-base sm:text-lg text-(--mut) leading-relaxed">
                    {band.body}
                  </p>
                  <Link
                    href={band.href}
                    className="mt-6 inline-flex items-center gap-1.5 text-base font-medium text-accent-dark dark:text-accent-light hover:underline underline-offset-4 interactive focus-ring rounded"
                  >
                    {band.linkLabel}
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>
                <div className={band.flip ? "lg:order-1" : undefined}>
                  <div className="rounded-card overflow-hidden border border-gray-200/60 dark:border-white/[0.08] bg-[#080c14] shadow-(--shadow-resting)">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; assets are pre-sized WebP */}
                    <img
                      src={band.image.src}
                      alt={band.image.alt}
                      width={1280}
                      height={853}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* AI tutor band — the visual is a working mock of the actual
                Ask-the-margin panel rather than a photo: it shows the product
                interaction itself, costs no asset bytes, and adapts to theme.
                The mock is decorative (aria-hidden); the copy carries the facts. */}
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center reveal">
              <div className="lg:order-2">
                <p className="text-xs font-semibold tracking-[0.2em] uppercase text-accent dark:text-accent-light font-mono mb-3">
                  AI tutor
                </p>
                <h3 className="font-display text-display-lg text-(--ink) text-balance">
                  An AI tutor that knows exactly where you are
                </h3>
                <p className="mt-4 text-base sm:text-lg text-(--mut) leading-relaxed">
                  Every lesson carries Ask the margin: press Cmd-K or Ctrl-K, ask what
                  confuses you, and a Claude-powered tutor streams an answer grounded
                  in the exact page you are reading — no tab-switching, no pasting
                  context. Included free for every learner.
                </p>
                <Link
                  href="#curriculum"
                  className="mt-6 inline-flex items-center gap-1.5 text-base font-medium text-accent-dark dark:text-accent-light hover:underline underline-offset-4 interactive focus-ring rounded"
                >
                  Meet it inside any lesson
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
              <div className="lg:order-1">
                <div
                  aria-hidden="true"
                  className="rounded-card overflow-hidden border border-gray-200/60 dark:border-white/[0.08] bg-[#080c14] shadow-(--shadow-resting) p-6 sm:p-8"
                >
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <p className="text-xs font-semibold tracking-widest uppercase text-accent-light">
                      Ask the margin
                    </p>
                    <span className="flex items-center gap-1">
                      <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
                        Cmd
                      </kbd>
                      <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
                        K
                      </kbd>
                    </span>
                  </div>
                  {/* The frame pins #080c14 in both themes, so both resting
                      colors here sit on that dark ground — .text-caption's
                      gray-500 light value would be sub-AA on it. */}
                  <p className="text-[11px] text-gray-400 dark:text-gray-300 mb-2">
                    Reading: 03 — Quantum Algorithms
                  </p>
                  <div className="rounded-control border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-gray-200">
                    Why does Grover&apos;s search only need about &radic;N queries?
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-gray-300">
                    Each Grover iteration rotates the state a fixed angle toward the
                    marked item, so its amplitude — not just its probability — grows
                    with every step. Amplitudes square into probabilities, which is
                    where the quadratic speedup lives: about &pi;/4&middot;&radic;N
                    iterations instead of N/2 checks.
                    <span className="animate-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent-light" />
                  </p>
                </div>
              </div>
            </div>
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
        className="dark relative overflow-hidden bg-[#0a0f1a] border-y border-white/[0.06]"
      >
        <div className="absolute inset-0 bg-atmosphere" />
        <div className="absolute inset-0 bg-grid-dots [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black,transparent)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent/[0.08] rounded-full blur-[120px] pointer-events-none" />

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
          <p className="mt-6 text-sm text-gray-300">
            Email or Google. No credit card — the entire curriculum and simulator are
            free.
          </p>
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
