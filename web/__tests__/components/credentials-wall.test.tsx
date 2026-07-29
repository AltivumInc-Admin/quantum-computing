/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act, waitFor } from "@testing-library/react";

// The hardware group pulls COMPLETED runs from the QPU backend. Default: QPU off
// (isQpuConfigured false) → the effect no-ops, hardware badges stay locked, and
// the other tests are unaffected.
jest.mock("@/lib/qpu-client", () => {
  // The REAL rate-limit predicate and the error class it narrows on: a stubbed
  // isRateLimited would let this file stay green while the classification itself
  // rotted (the reasoning qpu-submit-panel.test.tsx records for its own mock).
  const actual = jest.requireActual("@/lib/qpu-client") as typeof import("@/lib/qpu-client");
  return {
    __esModule: true,
    isQpuConfigured: jest.fn(() => false),
    getBudget: jest.fn(),
    isRateLimited: actual.isRateLimited,
    QpuHttpError: actual.QpuHttpError,
  };
});

// The hardware fetch is gated on auth resolving (status === "authenticated") —
// mutable so tests can drive the configuring → authenticated transition.
let mockAuthStatus = "authenticated";
// <MyFoundingBadges />, mounted inside the wall, reads emailHash off this same
// mock — without it here the component is a permanent no-op and its only
// integration point into the wall goes untested.
let mockEmailHash: string | null = null;
jest.mock("@/components/auth/auth-provider", () => ({
  __esModule: true,
  useAuth: () => ({ status: mockAuthStatus, email: null, emailHash: mockEmailHash, signOut: async () => {} }),
}));

// Follows the pattern in __tests__/components/founding-ten/my-badges.test.tsx:
// stub badgeForEmailHash so one known hash resolves to an issued badge.
jest.mock("@/lib/founding-ten", () => {
  const actual = jest.requireActual("@/lib/founding-ten");
  return {
    ...actual,
    badgeForEmailHash: (h: string) =>
      h === "b".repeat(64)
        ? [{ cohort: "charter", serial: 1, holder: "Irving Salinas", issuedAt: "2026-07-29", emailHash: h }]
        : [],
  };
});

import { CredentialsWall } from "@/components/credentials-wall";
import { LocaleProvider, translate } from "@/i18n";
import * as qpu from "@/lib/qpu-client";
import { epochDay } from "@/lib/review-schedule";
import { RETENTION_STABILITY } from "@/lib/runbook";

const today = epochDay(Date.now());

function seedRetained(id: string, n: number) {
  for (let i = 0; i < n; i++) {
    localStorage.setItem(
      `qc:card:${id}:${i}`,
      JSON.stringify({
        reps: 3, lapses: 0, stability: RETENTION_STABILITY + 5, difficulty: 5,
        dueEpochDay: today + 30, lastEpochDay: today - 1,
      }),
    );
  }
}

describe("CredentialsWall", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthStatus = "authenticated";
    mockEmailHash = null;
    (qpu.getBudget as jest.Mock).mockClear();
  });

  it("renders all four medal groups and an earned/total summary", () => {
    render(<CredentialsWall />);
    expect(screen.getByRole("heading", { name: "Completion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mastery" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Consistency" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hardware" })).toBeInTheDocument();
    expect(screen.getByText(/of \d+ earned/i)).toBeInTheDocument();
  });

  it("shows a holder's Founding Ten badge above the earned medals when emailHash matches", () => {
    mockEmailHash = "b".repeat(64);
    render(<CredentialsWall />);
    const foundingTen = screen.getByLabelText("Founding Ten");
    expect(foundingTen).toHaveTextContent(/Charter Member/);
    expect(screen.getByRole("link", { name: /public record/i })).toHaveAttribute(
      "href",
      "/founding-ten/charter-01",
    );
  });

  it("lights the hardware badge from the SERVER counters, not the truncated task list", async () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 2_500_000, spentMicros: 445_000, remainingMicros: 2_055_000, credentialed: true,
      completedRuns: 1,
      completedShots: 100,
      // `tasks` deliberately contains NO completed row: the medal must come from the
      // server aggregate above. The old code did tasks.filter(COMPLETED).length over
      // this 50-row-truncated window, which let an earned medal silently un-earn.
      tasks: [
        { idempotencyKey: "b", status: "SUBMITTED", device: "iqm_garnet", shots: 100, estMicros: 445_000, taskArn: "arn:y", circuitHash: null, createdAt: 2 },
      ],
    });
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    // One COMPLETED run → the "Ran on real hardware" tier earns (async fetch).
    await waitFor(() => expect(hardware).toHaveTextContent(/Earned/));
    expect(hardware).toHaveTextContent(/1 completed run on IQM Garnet/);
    // The lab record — the artifact a peer would be shown.
    expect(hardware).toHaveTextContent(/Your record: 1 completed run, 100 shots on IQM Garnet/);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false); // reset for other tests
  });

  it("states that the platform pays for the hardware runs", () => {
    render(<CredentialsWall />);
    expect(screen.getByLabelText("Hardware")).toHaveTextContent(
      /The platform pays Amazon Braket for every one of these runs/i,
    );
  });

  it("waits out the Amplify-bridge race: no fetch while configuring, fetch on authenticated", async () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 2_500_000, spentMicros: 445_000, remainingMicros: 2_055_000, credentialed: true,
      completedRuns: 1,
      completedShots: 100,
      tasks: [
        { idempotencyKey: "a", status: "COMPLETED", device: "iqm_garnet", shots: 100, estMicros: 445_000, taskArn: "arn:x", circuitHash: null, createdAt: 1 },
      ],
    });

    // Auth still resolving (Amplify.configure not yet run): fetching now is the
    // exact race this guards against — it must NOT happen.
    mockAuthStatus = "configuring";
    const { rerender } = render(<CredentialsWall />);
    expect(qpu.getBudget).not.toHaveBeenCalled();

    // Auth resolves → the status dep re-runs the effect and the fetch lands.
    mockAuthStatus = "authenticated";
    rerender(<CredentialsWall />);
    await waitFor(() => expect(qpu.getBudget).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText("Hardware")).toHaveTextContent(/Earned/)
    );
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("treats signed-out as an honest zero: no fetch, locked medals, no error note", () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    mockAuthStatus = "unauthenticated";
    render(<CredentialsWall />);
    expect(qpu.getBudget).not.toHaveBeenCalled();
    const hardware = screen.getByLabelText("Hardware");
    expect(hardware).toHaveTextContent(/Locked/);
    expect(hardware).not.toHaveTextContent(/couldn't verify/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  // ---- the four states -------------------------------------------------------
  // earned / locked / out-of-reach / could-not-verify must be four DISTINGUISHABLE
  // states, and distinguishable to a screen reader — i.e. by the medal's own chip
  // text, not by colour and not by a caveat parked in a group header.
  it("an unearned hardware medal the remaining budget cannot buy is OUT OF REACH, not 'Locked'", async () => {
    // THE RELOCATED BUG. Three runs at the panel's 100-shot default cost $1.335 of the
    // $2.50 lifetime allowance. $1.165 is left, which buys at most 596 more shots — so
    // 300 + 596 = 896, forever short of the 1,000-shot medal. The wall went on calling
    // it "Locked", a word that promises the medal is still winnable.
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 2_500_000,
      spentMicros: 1_335_000,
      remainingMicros: 1_165_000,
      credentialed: true,
      completedRuns: 3,
      completedShots: 300,
      tasks: [],
    });
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() => expect(hardware).toHaveTextContent(/Out of reach/i));

    const item = (title: string) =>
      Array.from(hardware.querySelectorAll("li")).find((li) => li.textContent?.includes(title))!;
    // Deep sample: foreclosed — and it says so, in text, on the medal itself.
    expect(item("Deep sample")).toHaveTextContent(/Out of reach/i);
    expect(item("Deep sample")).toHaveTextContent(/out of reach on your remaining sponsored budget/i);
    expect(item("Deep sample")).not.toHaveTextContent(/Locked/i);
    // The two run medals ARE earned at 3 runs — the states coexist on one wall.
    expect(item("Run series")).toHaveTextContent(/Earned/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("keeps saying LOCKED while a medal is still attainable", async () => {
    // The same 300 shots, but with the allowance to still reach 1,000: Locked is the
    // truth here, and "out of reach" would be a lie in the other direction.
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 2_500_000,
      spentMicros: 445_000,
      remainingMicros: 2_055_000,
      credentialed: true,
      completedRuns: 1,
      completedShots: 300,
      tasks: [],
    });
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() => expect(hardware).toHaveTextContent(/Earned/i)); // the 1-run tier
    const deep = Array.from(hardware.querySelectorAll("li")).find((li) =>
      li.textContent?.includes("Deep sample"),
    )!;
    expect(deep).toHaveTextContent(/Locked/i);
    expect(deep).not.toHaveTextContent(/Out of reach/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("a SUCCESSFUL fetch with NO server counters is UNVERIFIED, not zeros — an older Lambda", async () => {
    // The deployed Lambda predated the medal counters and returned a budget WITHOUT
    // them. Reading that as {runs:0, shots:0} would un-earn a real medal, and reading it
    // as a foreclosure would be the "NaN — out of reach" bug on this surface. The record
    // is UNKNOWN — the same state as a failed fetch.
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockResolvedValue({
      capMicros: 2_500_000,
      spentMicros: 445_000,
      remainingMicros: 2_055_000,
      credentialed: true,
      completedRuns: null,
      completedShots: null,
      tasks: [],
    });
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() => expect(hardware).toHaveTextContent(/Unverified/i));
    for (const li of Array.from(hardware.querySelectorAll("li"))) {
      expect(li).toHaveTextContent(/Unverified/i);
      expect(li).not.toHaveTextContent(/Locked/i);
      expect(li).not.toHaveTextContent(/Out of reach/i);
    }
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("never calls a medal out of reach when the budget is UNKNOWN (signed out)", () => {
    // An unknown must never be reported as a foreclosure.
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    mockAuthStatus = "unauthenticated";
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    expect(hardware).toHaveTextContent(/Locked/i);
    expect(hardware).not.toHaveTextContent(/Out of reach/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("routes out of the dead end: the plan, the finite allowance, and the way to run", () => {
    // The group listed three requirements, named no surface that grants them, and never
    // said the money behind them is finite. Numbers derive from the ladder + PRICING.
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    expect(hardware).toHaveTextContent(
      /All three fit inside the sponsored allowance: 3 runs totalling 1,000 shots — \$2\.35/i,
    );
    expect(hardware).toHaveTextContent(/one-time and does not refill/i);
    expect(screen.getByRole("link", { name: /run on iqm garnet/i })).toHaveAttribute(
      "href",
      "/workspace",
    );
  });

  it("shows an explicit couldn't-verify state when the budget fetch fails", async () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockRejectedValue(new Error("budget failed (502)"));
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() =>
      // "record", not "runs": the group is fed by shots AND runs now.
      expect(hardware).toHaveTextContent(/couldn't verify your hardware record/i)
    );
    // Signed out is NOT an error: NotSignedIn keeps the honest locked zero.
    (qpu.getBudget as jest.Mock).mockRejectedValue(
      Object.assign(new Error("not signed in"), { name: "NotSignedIn" })
    );
    render(<CredentialsWall />);
    const walls = screen.getAllByLabelText("Hardware");
    await waitFor(() => expect(qpu.getBudget).toHaveBeenCalledTimes(2));
    expect(walls[walls.length - 1]).not.toHaveTextContent(/couldn't verify/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("an unverifiable medal announces UNVERIFIED — never 'Locked' — and carries the reason", async () => {
    // The caveat used to live in the group header, which a screen-reader user
    // navigating by list item never hears: an EARNED medal announced as "Locked" to
    // them and only to them. The state now rides on the medal, and the explanation
    // travels with it via aria-describedby.
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockRejectedValue(new Error("budget failed (502)"));
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() => expect(hardware).toHaveTextContent(/Unverified/i));
    // Every MEDAL (the group note is allowed to say the word "locked" — it is what it
    // is explaining) must announce Unverified, and none may announce Locked.
    for (const li of Array.from(hardware.querySelectorAll("li"))) {
      expect(li).toHaveTextContent(/Unverified/i);
      expect(li).not.toHaveTextContent(/Locked/i);
      expect(li).not.toHaveTextContent(/Out of reach/i); // unknown is not foreclosed
    }

    const described = hardware.querySelector("li [aria-describedby]")!;
    const noteId = described.getAttribute("aria-describedby")!;
    const note = document.getElementById(noteId)!;
    expect(note).toHaveTextContent(/couldn't verify your hardware record/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  /**
   * A THROTTLED record read (the edge's 429, lambda/qpu/edge.yaml). Two claims, and the
   * split between them is the whole fix:
   *
   *  - the MEDAL STATE must not move. Under a throttle the record is genuinely unknown,
   *    so nothing may show as earned and nothing as "Locked" (a word that asserts the
   *    medal is still winnable). "Unverified" is the honest state and stays.
   *  - the EXPLANATION must move. The generic note says the record could not be verified
   *    and ends "Reload to retry" — under a rate limit that is advice that makes it
   *    worse, since an immediate reload is one more blocked request. It was also the
   *    THIRD diagnosis one throttle produced on /workspace, next to the submit panel's
   *    "a rate limit, not an outage".
   */
  const throttle = () => {
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
    (qpu.getBudget as jest.Mock).mockRejectedValue(new qpu.QpuHttpError("budget", 429));
  };

  it("a THROTTLED read keeps the medals unverified — the state must not move", async () => {
    throttle();
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() => expect(hardware).toHaveTextContent(/Unverified/i));
    for (const li of Array.from(hardware.querySelectorAll("li"))) {
      expect(li).toHaveTextContent(/Unverified/i);
      expect(li).not.toHaveTextContent(/Locked/i); // never "still winnable"
      expect(li).not.toHaveTextContent(/Out of reach/i); // never a foreclosure
      expect(li).not.toHaveTextContent(/Earned/i); // and never earned on an unknown
    }
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("a THROTTLED read explains the rate limit — not an unverifiable record", async () => {
    throttle();
    render(<CredentialsWall />);
    const hardware = screen.getByLabelText("Hardware");
    await waitFor(() => expect(hardware).toHaveTextContent(/Unverified/i));
    // The note the unverified medals point at — read it through aria-describedby, so
    // this asserts the explanation a screen-reader user actually reaches.
    const described = hardware.querySelector("li [aria-describedby]")!;
    const note = document.getElementById(described.getAttribute("aria-describedby")!)!;
    expect(note).toHaveTextContent(/rate limit, not an outage/i);
    expect(note).toHaveTextContent(/wait a minute/i);
    // Still says what the medals show, because that is still true.
    expect(note).toHaveTextContent(/unverified, not locked/i);
    // The two things the generic note gets wrong here.
    expect(note).not.toHaveTextContent(/couldn't verify your hardware record/i);
    expect(note).not.toHaveTextContent(/reload to retry/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("does NOT hijack a 403 or a 502 — those keep the couldn't-verify note", async () => {
    // 403 on the QPU path is ambiguous (qpu-core.mjs answers an edge-secret mismatch
    // with it), so it must keep reading as a fault rather than telling the learner to
    // wait out a misconfiguration — the same line qpu-client.ts draws.
    for (const status of [403, 502]) {
      (qpu.isQpuConfigured as jest.Mock).mockReturnValue(true);
      (qpu.getBudget as jest.Mock).mockRejectedValue(new qpu.QpuHttpError("budget", status));
      const { unmount } = render(<CredentialsWall />);
      const hardware = screen.getByLabelText("Hardware");
      await waitFor(() => expect(hardware).toHaveTextContent(/couldn't verify your hardware record/i));
      expect(hardware).not.toHaveTextContent(/rate limit/i);
      unmount();
    }
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("says the throttle in Spanish", async () => {
    localStorage.setItem("qc:locale", "es");
    throttle();
    render(
      <LocaleProvider>
        <CredentialsWall />
      </LocaleProvider>,
    );
    const hardware = screen.getByLabelText("Hardware");
    const es = translate("es", "credentialsUi.unverifiedThrottledNote");
    // A Spanish leaf copied from English would satisfy the render assertion below while
    // shipping the untranslated sentence.
    expect(es).not.toBe(translate("en", "credentialsUi.unverifiedThrottledNote"));
    await waitFor(() => expect(hardware).toHaveTextContent(es));
    expect(hardware).not.toHaveTextContent(/rate limit, not an outage/i);
    (qpu.isQpuConfigured as jest.Mock).mockReturnValue(false);
  });

  it("earns a completion medal from a section flag", () => {
    localStorage.setItem("qc:section:00-prereqs", "1");
    render(<CredentialsWall />);
    const section = screen.getByLabelText("Completion");
    // The completed module's medal shows "Earned"; the rest show "Locked".
    expect(section).toHaveTextContent(/Earned/);
  });

  it("earns mastery medals from retained CardStates (state conveyed by text, not just color)", () => {
    seedRetained("challenge:m", 5); // 5 skills in proven retention
    render(<CredentialsWall />);
    const mastery = screen.getByLabelText("Mastery");
    // The 1- and 5-skill tiers are Earned; 15/30/50 are Locked.
    const earned = mastery.querySelectorAll("li");
    const earnedLabels = Array.from(earned).map((li) =>
      li.textContent?.includes("Earned"),
    );
    expect(earnedLabels.filter(Boolean).length).toBe(2);
  });

  it("earns a consistency medal from the longest weekly streak", () => {
    // Active this week + each of the last 3 weeks -> a 4-week streak.
    for (const w of [0, 1, 2, 3]) localStorage.setItem(`qc:log:day:${today - w * 7}`, "1");
    seedRetained("challenge:x", 1);
    render(<CredentialsWall />);
    const consistency = screen.getByLabelText("Consistency");
    expect(consistency).toHaveTextContent(/Earned/);
    expect(consistency).toHaveTextContent(/4-week streak/);
  });

  it("lights a consistency medal live when a logged active day extends the streak", () => {
    seedRetained("challenge:x", 1);
    // Three consecutive prior weeks (NOT this week) → longest streak 3, below the 4-week tier.
    for (const w of [1, 2, 3]) localStorage.setItem(`qc:log:day:${today - w * 7}`, "1");
    render(<CredentialsWall />);
    expect(screen.getByLabelText("Consistency")).not.toHaveTextContent("Earned");
    // Logging THIS week extends the run to 4 — but it writes no card state, so the
    // fingerprint must carry the active-day count or this update would be missed.
    act(() => {
      localStorage.setItem(`qc:log:day:${today}`, "1");
      window.dispatchEvent(new Event("qc-progress"));
    });
    expect(screen.getByLabelText("Consistency")).toHaveTextContent("Earned");
  });

  it("renders the whole wall in Spanish when the stored locale is es", () => {
    // The wiring proof. Every string below already had a Spanish translation in the
    // dictionary; the wall referenced none of them, so a Spanish learner read an
    // English wall — including the medal STATE words, which are the only place a
    // screen-reader user hears earned/locked at all.
    localStorage.setItem("qc:locale", "es");
    render(
      <LocaleProvider>
        <CredentialsWall />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Tus credenciales" })).toBeInTheDocument();
    for (const group of ["Finalización", "Dominio", "Constancia", "Hardware"]) {
      expect(screen.getByRole("heading", { name: group })).toBeInTheDocument();
    }
    const mastery = screen.getByLabelText("Dominio");
    expect(mastery).toHaveTextContent("Primera retención");
    expect(mastery).toHaveTextContent("Bloqueada");
    expect(mastery).toHaveTextContent("Mantén 1 habilidad en retención comprobada");
    expect(mastery).not.toHaveTextContent(/Locked/i);
    // The wall's own prose, not just the medal kernel's.
    expect(screen.getByLabelText("Hardware")).toHaveTextContent(
      /Las tres caben en el presupuesto patrocinado/,
    );
    expect(screen.getByRole("link", { name: "Ejecutar en IQM Garnet" })).toBeInTheDocument();
  });

  it("updates live on the qc-progress channel", () => {
    render(<CredentialsWall />);
    // The summary ("N of M earned") is split across nodes — read the paragraph.
    const summary = () =>
      screen
        .getByText((_c, el) => el?.tagName === "P" && /earned$/.test(el.textContent?.trim() ?? ""))
        .textContent!.replace(/\s+/g, " ")
        .trim();
    expect(summary()).toMatch(/^0 of/);
    act(() => {
      localStorage.setItem("qc:section:00-prereqs", "1");
      window.dispatchEvent(new Event("qc-progress"));
    });
    expect(summary()).toMatch(/^1 of/);
  });
});
