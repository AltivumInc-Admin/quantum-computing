import type { Metadata } from "next";
import Link from "next/link";
import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { GLOSSARY } from "@/lib/glossary";
import { isAuthConfigured } from "@/lib/auth-config";
import { SectionCard } from "@/components/section-card";
import { GlossaryCard } from "@/components/glossary-card";

export const metadata: Metadata = {
  description:
    "Learn quantum computing from first principles with Amazon Braket: a hands-on curriculum, a live circuit playground, real QPU access with transparent costs, and an AI tutor in the margin.",
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

  const stats = [
    { value: sections.length, label: "curriculum sections" },
    { value: notebookTotal, label: "hands-on notebooks" },
    { value: GLOSSARY.length, label: "glossary terms" },
  ];

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
      body: `${notebookTotal} hands-on notebooks across ${sections.length} sections take you from your first qubit to production hybrid quantum-classical jobs. Most run directly in your browser — no installation, no setup, no account required to start.`,
      href: "#curriculum",
      linkLabel: "Browse the learning path",
      image: {
        src: "/welcome/bloch.webp",
        alt: "Wireframe Bloch sphere of fine teal lines with a gold state-vector arrow, above faint interference ripples",
      },
    },
  ];

  const toolkit = [
    {
      title: "Ask the margin",
      body: "An AI tutor lives beside every lesson. Highlight what confuses you and ask — answers arrive in context, without leaving the page.",
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
      {/* Hero — a self-dark cinematic band in both themes; the imagery is    */}
      {/* the atmosphere, so text colors are literal (no dark: variants).     */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden bg-[#080c14]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; assets are pre-sized WebP with an explicit srcSet */}
        <img
          src="/welcome/hero.webp"
          srcSet="/welcome/hero-960.webp 960w, /welcome/hero.webp 1920w"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Legibility + blend: darken the text side, dissolve into the page. */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#080c14]/95 via-[#080c14]/60 to-[#080c14]/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080c14]/40 via-transparent to-[#080c14]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-28 sm:pt-32 sm:pb-36">
          <div className="max-w-3xl animate-hero-enter">
            <p className="text-sm font-medium tracking-widest uppercase text-accent-light mb-5">
              Amazon Braket Learning Platform
            </p>
            <h1 className="font-display text-display-2xl tracking-tight text-white">
              Master <span className="text-gradient">quantum computing</span> from first
              principles
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-300 max-w-2xl leading-relaxed">
              A progressive curriculum from circuit fundamentals to production hybrid
              workloads — with a live playground, real quantum hardware, and an AI tutor
              in the margin. Free to learn, right in your browser.
            </p>
            <div className="mt-9 animate-slide-in" style={{ animationDelay: "300ms" }}>
              <AuthCtas />
            </div>
          </div>

          <dl
            className="mt-16 flex flex-wrap gap-x-12 gap-y-6 animate-slide-in"
            style={{ animationDelay: "500ms" }}
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display text-display-lg text-white tabular-nums">
                  {stat.value}
                </dd>
                <dd className="mt-1 text-sm text-gray-300">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* What you can do here — three image-led bands.                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
        <div className="absolute inset-0 bg-grid-dots-light dark:bg-grid-dots [mask-image:radial-gradient(ellipse_70%_50%_at_50%_50%,black,transparent)]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="flex items-center gap-4 mb-16 reveal">
            <h2 className="font-display text-display-xl text-gray-900 dark:text-white">
              One place to learn, build, and run
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
          </div>

          <div className="space-y-24">
            {bands.map((band) => (
              <div
                key={band.kicker}
                className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center reveal"
              >
                <div className={band.flip ? "lg:order-2" : undefined}>
                  <p className="text-xs font-semibold tracking-widest uppercase text-accent dark:text-accent-light mb-3">
                    {band.kicker}
                  </p>
                  <h3 className="font-display text-display-lg text-gray-900 dark:text-white text-balance">
                    {band.title}
                  </h3>
                  <p className="mt-4 text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
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
          </div>

          {/* Toolkit trio — the retention layer. */}
          <div className="mt-24 grid gap-5 sm:grid-cols-3 reveal">
            {toolkit.map((tool) => {
              const inner = (
                <>
                  <h3 className="font-display text-display-md text-gray-900 dark:text-white">
                    {tool.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {tool.body}
                  </p>
                </>
              );
              const chrome =
                "block h-full rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)";
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
        className="relative overflow-hidden bg-[#0a0f1a] border-y border-white/[0.06]"
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
            <h2 className="font-display text-display-xl text-gray-900 dark:text-white">
              Learning Path
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
            <span className="text-sm text-gray-500 dark:text-gray-500 tabular-nums">
              {sections.length} sections
            </span>
          </div>
          <ul role="list" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section, i) => (
              <li
                key={section.slug}
                className="animate-card-enter"
                style={{ animationDelay: `${150 + i * 80}ms` }}
              >
                <SectionCard
                  slug={section.slug}
                  index={section.index}
                  title={section.title}
                  summary={summaries[i] || "Hands-on lessons and exercises."}
                  notebookCount={section.notebookCount}
                />
              </li>
            ))}
            <li
              className="animate-card-enter"
              style={{ animationDelay: `${150 + sections.length * 80}ms` }}
            >
              <GlossaryCard />
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
