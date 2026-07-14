"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { isQpuConfigured } from "@/lib/qpu-client";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceBudgetProvider } from "@/components/workspace/budget-provider";
import { Masthead } from "@/components/workspace/masthead";
import { Instrument } from "@/components/workspace/instrument";
import { Valve } from "@/components/workspace/valve";
import { Lab } from "@/components/workspace/lab";
import { CurriculumMap } from "@/components/workspace/curriculum-map";
import { Records } from "@/components/workspace/records";
import { WithinReach } from "@/components/workspace/within-reach";
import { ConsolePanel } from "@/components/workspace/console-panel";
import { QpuSubmitPanel } from "@/components/quantum/qpu-submit-panel";

/**
 * /workspace — THE BENCH. The instrument (what you have made durable) beside the valve
 * (the one control that moves it); below, the work you do — the lab you open, the map
 * you plan from, the records you set — and the rail of chrome that serves it: hardware,
 * objectives, settings. Two stacked grids (cockpit 8/4, work 8/4) at lg, collapsing to
 * ONE column in source order below lg — no CSS `order`, so DOM order == reading order
 * at every breakpoint. Every state carries the page's one <h1>.
 */

// The rehoused QpuSubmitPanel gets the panel card shell; its internal mini-cards are
// the one visible seam §1 names as out of scope. Present only when authed + configured.
const QPU_SHELL =
  "rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-5 shadow-(--shadow-resting)";

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>;
}

export default function WorkspacePage() {
  const router = useRouter();
  const { status, email, signOut } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  // Signed in but configured → /login is the honest door. Keep the h1 so the page is
  // never heading-less, even mid-redirect.
  if (status === "unauthenticated") {
    return (
      <Container>
        <PageHeading />
        <p role="status" className="mt-4 text-sm text-caption">
          Redirecting to sign in…
        </p>
      </Container>
    );
  }

  if (status === "configuring") {
    return (
      <Container>
        <PageHeading />
        <SkeletonGrid />
      </Container>
    );
  }

  // "unconfigured" AND "authenticated" both render THE BENCH — the cockpit is pure
  // localStorage + build-time manifest and is fully truthful without an account.
  return (
    <WorkspaceBudgetProvider>
      <Bench status={status} email={email} onSignOut={() => void handleSignOut()} />
    </WorkspaceBudgetProvider>
  );
}

/** The bare h1 (+ nothing else) — the guaranteed heading for the redirect/loading shells. */
function PageHeading() {
  return (
    <h1 className="font-display text-display-lg tracking-tight text-gray-900 dark:text-white">
      Workspace
    </h1>
  );
}

function Bench({
  status,
  email,
  onSignOut,
}: {
  status: "authenticated" | "unconfigured";
  email: string | null;
  onSignOut: () => void;
}) {
  const model = useWorkspace();
  const authed = status === "authenticated";
  const qpuOn = authed && isQpuConfigured();

  return (
    <Container>
      <Masthead email={authed ? email : null} />

      {model === null ? (
        <SkeletonGrid />
      ) : (
        <div className="animate-fade-up">
          {/* THE COCKPIT BAND — instrument beside valve. */}
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            <section className="lg:col-span-8">
              <Instrument
                mastery={model.mastery}
                masteredThisWeek={model.masteredThisWeek}
                spectrum={model.spectrum}
                sparse={model.sparse}
              />
            </section>
            <section className="lg:col-span-4">
              <Valve
                valve={model.valve}
                due={model.due}
                dueKinds={model.dueKinds}
                dueRetained={model.dueRetained}
              />
            </section>
          </div>

          {/* THE WORK BAND — the work on the left, the chrome that serves it on the right. */}
          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="flex flex-col gap-4 lg:col-span-8">
              <Lab sections={model.sections} runnableTotal={model.runnableTotal} />
              <CurriculumMap sections={model.sections} sectionsDone={model.sectionsDone} />
              <Records records={model.records} />
            </div>
            <aside className="flex flex-col gap-4 lg:col-span-4">
              {qpuOn && <QpuSubmitPanel className={QPU_SHELL} />}
              <WithinReach
                reachMastery={model.reachMastery}
                reachConsistency={model.reachConsistency}
                sectionsTotal={model.sectionsTotal}
              />
              {authed ? (
                <ConsolePanel email={email} onSignOut={onSignOut} />
              ) : (
                <UnconfiguredNote />
              )}
            </aside>
          </div>
        </div>
      )}
    </Container>
  );
}

/** The rail's one note when accounts are not enabled on this build (§4). */
function UnconfiguredNote() {
  return (
    <div className="rounded-card border border-gray-200/60 bg-(--surface-1) px-5 py-4 text-sm text-caption shadow-(--shadow-resting) dark:border-white/[0.06]">
      Accounts are not enabled on this build; progress is stored on this device.
    </div>
  );
}

/**
 * The real grid's skeleton — same panels, same heights, so nothing pops and there is
 * zero CLS. One role="status" region announces the load; the placeholders are
 * decorative. The pulse is neutralised under prefers-reduced-motion by the global rule.
 */
function SkeletonGrid() {
  const box = (h: string) =>
    `rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-resting) animate-pulse motion-reduce:animate-none ${h}`;
  return (
    <div role="status" aria-busy="true" className="mt-6">
      <span className="sr-only">Loading your workspace</span>
      <div className="grid gap-4 lg:grid-cols-12">
        <div aria-hidden="true" className={`lg:col-span-8 ${box("h-80")}`} />
        <div aria-hidden="true" className={`lg:col-span-4 ${box("h-80")}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <div aria-hidden="true" className={box("h-64")} />
          <div aria-hidden="true" className={box("h-72")} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <div aria-hidden="true" className={box("h-56")} />
          <div aria-hidden="true" className={box("h-40")} />
        </div>
      </div>
    </div>
  );
}
