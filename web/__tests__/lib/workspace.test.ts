/**
 * @jest-environment jsdom
 */
import { resolveValve, readWorkspace, LAB_HREF } from "@/lib/workspace";
import { gradeCard, setCardContent } from "@/lib/review-store";
import { setSectionComplete } from "@/lib/progress-store";
import { getSections } from "@/lib/sections";

// The Valve is the page's whole thesis, so its precedence must be provable as a pure
// function of (due, tracked, daysUntilNext, firstIncomplete).
describe("resolveValve — deterministic precedence", () => {
  const incomplete = { slug: "02-hardware", title: "Quantum Hardware on Amazon Braket" };

  it("1. due > 0 → Review N cards → /review (the review case; the count IS the line)", () => {
    const v = resolveValve({ due: 7, tracked: 60, daysUntilNext: 3, firstIncomplete: incomplete });
    expect(v).toEqual({
      kind: "review",
      headline: "",
      cta: "Review 7 cards",
      href: "/review",
      external: false,
    });
  });

  it("1b. singularises a single due card", () => {
    expect(resolveValve({ due: 1, tracked: 5, daysUntilNext: 1, firstIncomplete: null }).cta).toBe(
      "Review 1 card",
    );
  });

  it("2. due 0, modules remain → next-Rep line + Continue {first incomplete}", () => {
    const v = resolveValve({ due: 0, tracked: 40, daysUntilNext: 3, firstIncomplete: incomplete });
    expect(v.kind).toBe("continue");
    expect(v.headline).toBe("Nothing is due. Next Rep in 3 days.");
    expect(v.cta).toBe("Continue Quantum Hardware on Amazon Braket");
    expect(v.href).toBe("/learn/02-hardware");
    expect(v.external).toBe(false);
  });

  it("2b. singularises a one-day wait", () => {
    expect(
      resolveValve({ due: 0, tracked: 40, daysUntilNext: 1, firstIncomplete: incomplete }).headline,
    ).toBe("Nothing is due. Next Rep in 1 day.");
  });

  it("3. due 0, all modules complete → same line + Open the lab (external)", () => {
    const v = resolveValve({ due: 0, tracked: 40, daysUntilNext: 5, firstIncomplete: null });
    expect(v.kind).toBe("lab");
    expect(v.cta).toBe("Open the lab");
    expect(v.href).toBe(LAB_HREF);
    expect(v.external).toBe(true);
  });

  it("4. tracked 0 → Start Prerequisites (checked BEFORE continue, even with an incomplete module)", () => {
    const v = resolveValve({ due: 0, tracked: 0, daysUntilNext: null, firstIncomplete: incomplete });
    expect(v.kind).toBe("start");
    expect(v.headline).toBe("You have not graded a Rep yet.");
    expect(v.cta).toBe("Start Prerequisites");
    expect(v.href).toBe("/learn/00-prereqs");
  });

  it("falls back to a generic line when nothing is pending (daysUntilNext null)", () => {
    expect(
      resolveValve({ due: 0, tracked: 40, daysUntilNext: null, firstIncomplete: incomplete })
        .headline,
    ).toBe("Nothing is due right now.");
  });

  it("is never blank and never congratulates", () => {
    for (const v of [
      resolveValve({ due: 3, tracked: 3, daysUntilNext: null, firstIncomplete: incomplete }),
      resolveValve({ due: 0, tracked: 3, daysUntilNext: 2, firstIncomplete: incomplete }),
      resolveValve({ due: 0, tracked: 3, daysUntilNext: 2, firstIncomplete: null }),
      resolveValve({ due: 0, tracked: 0, daysUntilNext: null, firstIncomplete: null }),
    ]) {
      expect(v.cta.length).toBeGreaterThan(0);
      expect(v.cta).not.toMatch(/congrat|great job|well done|nice/i);
    }
  });
});

describe("readWorkspace — the single local read", () => {
  beforeEach(() => localStorage.clear());

  it("renders honest zeros with no data (fully truthful signed out)", () => {
    const m = readWorkspace(100);
    expect(m.mastery).toBe(0);
    expect(m.spectrum.tracked).toBe(0);
    expect(m.due).toBe(0);
    expect(m.records).toEqual([]);
    expect(m.sparse).toEqual([]); // below the threshold → the honest interval list (empty)
    expect(m.valve.kind).toBe("start"); // tracked 0
    expect(m.sectionsTotal).toBe(getSections().length);
    // The catalog is present and honest even with no account.
    expect(m.sections).toHaveLength(7);
    expect(m.runnableTotal).toBe(32);
  });

  it("builds a Lab launcher href that resolves to a real manifest notebook path", () => {
    const m = readWorkspace(100);
    const foundations = m.sections.find((s) => s.slug === "01-foundations")!;
    const nb = foundations.runnable.find((n) => n.filename === "01-first-circuit.ipynb")!;
    // The exact route NotebookLink builds — path-encoded dirName/notebooks/filename.
    expect(nb.href).toBe(
      "/lab/lab/index.html?path=01-foundations%2Fnotebooks%2F01-first-circuit.ipynb",
    );
    expect(nb.index).toBe("01");
    expect(nb.label).toBe("first circuit");
    // 06-hybrid-jobs has zero browser-runnable notebooks — honest, never faked.
    expect(m.sections.find((s) => s.slug === "06-hybrid-jobs")!.runnable).toEqual([]);
  });

  it("reflects graded cards and a completed section", () => {
    // A due card (graded day 0, read at day 5).
    gradeCard("challenge:bell", "again", 0);
    setCardContent("challenge:bell", { prompt: "Build a Bell pair", answer: "", kind: "challenge" });
    setSectionComplete("00-prereqs", true);

    const today = 5;
    const m = readWorkspace(today);
    expect(m.due).toBe(1);
    expect(m.dueKinds).toEqual([{ kind: "challenge", label: "Circuit challenge", count: 1 }]);
    expect(m.valve.kind).toBe("review");
    expect(m.sectionsDone).toBe(1);
    expect(m.sections.find((s) => s.slug === "00-prereqs")?.done).toBe(true);
  });
});
