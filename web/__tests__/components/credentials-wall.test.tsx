/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { CredentialsWall } from "@/components/credentials-wall";
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
  beforeEach(() => localStorage.clear());

  it("renders the three medal groups and an earned/total summary", () => {
    render(<CredentialsWall />);
    expect(screen.getByRole("heading", { name: "Completion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mastery" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Consistency" })).toBeInTheDocument();
    expect(screen.getByText(/of \d+ earned/i)).toBeInTheDocument();
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
