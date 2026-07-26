/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Z7 "Within reach" had ZERO committed coverage while being the most heavily
 * rewritten file of the credentials-i18n pass — the rungs, the unit agreement, the
 * NaN guard and the Spanish wording all landed untested. This is that guard.
 *
 * The budget provider is mocked rather than driven: the component reads one context
 * value, so a stub is the whole seam and nothing about the component had to change to
 * make it testable.
 */
let mockBudget: { status: string; budget: unknown } = { status: "unconfigured", budget: null };
jest.mock("@/components/workspace/budget-provider", () => ({
  __esModule: true,
  useWorkspaceBudget: () => mockBudget,
}));

import { WithinReach } from "@/components/workspace/within-reach";
import { LocaleProvider } from "@/i18n";
import { HARDWARE_TIERS } from "@/lib/credentials";
import { costMicros } from "@/lib/qpu-budget";
import type { ReachRung } from "@/lib/workspace";

const rung = (over: Partial<ReachRung> = {}): ReachRung => ({
  // `title` is the tier's stable English identity; the component must NOT render it
  // (it renders the dictionary title derived from `target` instead). A deliberately
  // wrong value here is what proves that.
  title: "NEVER-RENDER-THIS",
  current: 3,
  target: 4,
  distance: 1,
  unit: "weeks",
  ...over,
});

// A money-complete budget. The counters are what each test varies.
const budget = (over: Record<string, unknown> = {}) => ({
  capMicros: 2_500_000,
  spentMicros: 0,
  remainingMicros: 2_500_000,
  credentialed: true,
  completedRuns: 0,
  completedShots: 0,
  tasks: [],
  ...over,
});

function draw(
  props: Partial<React.ComponentProps<typeof WithinReach>> = {},
  locale: "en" | "es" = "en",
) {
  // Several tests draw twice (one locale/rung, then another) — tear the first tree
  // down first, or every getByText below matches two nodes.
  cleanup();
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <WithinReach
        reachMastery={rung({ current: 4, target: 5, distance: 1, unit: "in retention" })}
        reachConsistency={rung()}
        sectionsTotal={7}
        {...props}
      />
    </LocaleProvider>,
  );
}

/** The rung is a labelled group heading plus its readouts — read the whole block. */
const block = (heading: string) => screen.getByText(heading).closest("div")!;

beforeEach(() => {
  localStorage.clear();
  mockBudget = { status: "unconfigured", budget: null };
});

describe("WithinReach — the local tracks", () => {
  it("names each rung by its DICTIONARY title, not the tier's English identity", () => {
    draw();
    // mastery 5 → "Practiced", consistency 4 → "Consistent" (credentialsUi.tiers.*).
    expect(block("Mastery")).toHaveTextContent("Practiced");
    expect(block("Consistency")).toHaveTextContent("Consistent");
    expect(document.body).not.toHaveTextContent("NEVER-RENDER-THIS");
  });

  it("agrees the unit noun with the TARGET, not the learner's current value", () => {
    // The defect this pins: workspace.ts built the rung's `unit` off `current`, so a
    // learner one week short read "3 of 4 week".
    draw();
    expect(block("Consistency")).toHaveTextContent("3 of 4 weeks");
    expect(block("Mastery")).toHaveTextContent("4 of 5 in retention");
  });

  it("says the singular 'falta' at distance 1 and 'faltan' above it — Spanish", () => {
    // "faltan 1" shipped on every track. Distance 1 is reachable on all of them.
    draw({}, "es");
    expect(block("Dominio")).toHaveTextContent("falta 1");
    expect(block("Dominio")).not.toHaveTextContent("faltan 1");
    expect(block("Constancia")).toHaveTextContent("falta 1");

    draw({ reachConsistency: rung({ current: 1, target: 4, distance: 3 }) }, "es");
    expect(block("Constancia")).toHaveTextContent("faltan 3");
  });

  it("renders the whole panel in Spanish, titles included", () => {
    draw({}, "es");
    expect(screen.getByText("Al alcance")).toBeInTheDocument();
    expect(block("Dominio")).toHaveTextContent("Con práctica"); // mastery tier 5
    expect(block("Constancia")).toHaveTextContent("Constante"); // consistency tier 4
    expect(block("Constancia")).toHaveTextContent("3 de 4 semanas");
    expect(screen.getByRole("link")).toHaveTextContent("Todas las 18 credenciales");
  });

  it("says the track is complete instead of inventing a rung", () => {
    draw({ reachMastery: null }, "en");
    expect(block("Mastery")).toHaveTextContent("All mastery credentials earned.");
    draw({ reachMastery: null }, "es");
    // Spanish's "de + bare noun" complement takes no article, so the lowercased
    // translated group noun is grammatical.
    expect(block("Dominio")).toHaveTextContent("Todas las credenciales de dominio obtenidas.");
  });

  it("counts credentials from the tier tables, never a hardcoded total", () => {
    draw({ sectionsTotal: 2 });
    expect(screen.getByRole("link")).toHaveTextContent(`All ${2 + 5 + 3 + 3} credentials`);
  });
});

describe("WithinReach — the hardware rung", () => {
  it("omits the rung entirely while the QPU surface is unconfigured", () => {
    draw();
    expect(screen.queryByText("Hardware")).not.toBeInTheDocument();
  });

  it("shows the loading line while the budget is in flight", () => {
    mockBudget = { status: "loading", budget: null };
    draw();
    expect(block("Hardware")).toHaveTextContent("Checking your hardware record…");
  });

  /**
   * THE NaN GUARD. A Lambda deployed before the medal counters omits them, so they
   * arrive as null. The old arithmetic printed "NaN of 1 run — out of reach": a medal
   * declared permanently lost because a field was missing. Unknown must read unknown,
   * and it must never be dressed as a foreclosure.
   */
  it.each([
    ["null counters", { status: "ready", budget: budget({ completedRuns: null, completedShots: null }) }],
    ["a null shot counter alone", { status: "ready", budget: budget({ completedShots: null }) }],
    ["a failed fetch", { status: "error", budget: null }],
    ["a signed-out session", { status: "signed-out", budget: null }],
  ])("reports the record as unavailable for %s — never NaN, never a verdict", (_label, state) => {
    mockBudget = state;
    draw();
    const hardware = block("Hardware");
    expect(hardware).toHaveTextContent("Hardware record unavailable.");
    expect(hardware).not.toHaveTextContent("NaN");
    expect(hardware).not.toHaveTextContent(/out of allowance/i);
    expect(hardware).not.toHaveTextContent(/fits/i);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("translates the unavailable line", () => {
    mockBudget = { status: "error", budget: null };
    draw({}, "es");
    expect(block("Hardware")).toHaveTextContent("Registro de hardware no disponible.");
  });

  /**
   * A throttle is not an outage. The edge's 429 (lambda/qpu/edge.yaml) once collapsed
   * into "error" here, so ONE rate limit produced three diagnoses on /workspace: the
   * submit panel said "a rate limit, not an outage", this rung said the record could
   * not be reached, and the credentials wall showed medals unverified. It also told the
   * learner to reload, which cannot work while the limit is in force. The rung must say
   * what the panel says, and it must not borrow the outage sentence to do it.
   */
  it.each([
    ["en", "This is a rate limit, not an outage", "Hardware record unavailable."],
    ["es", "no una interrupción del servicio", "Registro de hardware no disponible."],
  ])("calls a throttle a throttle, not an outage — %s", (locale, expected, outageLine) => {
    mockBudget = { status: "throttled", budget: null };
    draw({}, locale as "en" | "es");
    const hardware = block("Hardware");
    expect(hardware).toHaveTextContent(expected);
    // The specific regression: the throttle must NOT fall through to the outage line.
    expect(hardware).not.toHaveTextContent(outageLine);
    expect(hardware).not.toHaveTextContent("NaN");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("prices the next tier and says it fits while the allowance can still buy it", () => {
    mockBudget = { status: "ready", budget: budget() };
    draw();
    const hardware = block("Hardware");
    // First tier: 1 completed run. Its title comes from the dictionary, not the table.
    expect(hardware).toHaveTextContent("Ran on real hardware");
    expect(hardware).toHaveTextContent("0 of 1 run");
    expect(hardware).toHaveTextContent("1 run to go"); // singular noun AND singular count
    expect(hardware).toHaveTextContent("fits");
  });

  it("agrees the Spanish run noun with BOTH numbers it sits beside", () => {
    // Two runs done, three needed: the target is plural ("3 ejecuciones") while the
    // distance is singular ("falta 1 ejecución") — one baked suffix could not serve
    // both, which is why the unit is a plural pair and not part of the sentence.
    mockBudget = { status: "ready", budget: budget({ completedRuns: 2, completedShots: 200 }) };
    draw({}, "es");
    const hardware = block("Hardware");
    expect(hardware).toHaveTextContent("2 de 3 ejecuciones");
    expect(hardware).toHaveTextContent("falta 1 ejecución");
    expect(hardware).not.toHaveTextContent("faltan 1");
    expect(hardware).toHaveTextContent("Serie de ejecuciones"); // the tier title, in Spanish
  });

  it("says out-of-allowance — not 'locked' — once the money can no longer reach the tier", () => {
    // Three default 100-shot runs leave too little to buy the 1,000-shot top tier.
    const remaining = 2_500_000 - 3 * costMicros(100);
    mockBudget = {
      status: "ready",
      budget: budget({
        completedRuns: 3,
        completedShots: 300,
        spentMicros: 2_500_000 - remaining,
        remainingMicros: remaining,
      }),
    };
    draw();
    const hardware = block("Hardware");
    expect(hardware).toHaveTextContent("Deep sample");
    expect(hardware).toHaveTextContent("out of allowance");
    expect(hardware).not.toHaveTextContent(/locked/i);
    expect(hardware).not.toHaveTextContent(/\bfits\b/);
  });

  it("says every hardware credential is earned once the top tier is behind them", () => {
    const top = Math.max(...HARDWARE_TIERS.map((tier) => tier.n));
    mockBudget = { status: "ready", budget: budget({ completedRuns: 9, completedShots: top }) };
    draw();
    expect(block("Hardware")).toHaveTextContent("All hardware credentials earned.");
  });
});
