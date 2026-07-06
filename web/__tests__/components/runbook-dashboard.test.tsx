/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { RunbookDashboard } from "@/components/runbook-dashboard";
import { gradeCard } from "@/lib/review-store";
import { setSectionComplete } from "@/lib/progress-store";
import { epochDay } from "@/lib/review-schedule";
import { RETENTION_STABILITY, weekStartDay, weekOf } from "@/lib/runbook";

const today = epochDay(Date.now());

// A stored CardState at/over the retention threshold, last reviewed `day`.
function seedCard(id: string, stability: number, lastEpochDay: number) {
  localStorage.setItem(
    `qc:card:${id}`,
    JSON.stringify({ reps: 3, lapses: 0, stability, difficulty: 5, dueEpochDay: lastEpochDay + stability, lastEpochDay }),
  );
}
function seedActive(day: number) {
  localStorage.setItem(`qc:log:day:${day}`, "1");
}

describe("RunbookDashboard", () => {
  beforeEach(() => localStorage.clear());

  it("shows the empty state when there is no activity", () => {
    render(<RunbookDashboard />);
    expect(screen.getByText(/your runbook is empty/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start a lesson/i })).toBeInTheDocument();
  });

  it("renders the North-Star mastery count from retained CardStates", () => {
    seedCard("a", RETENTION_STABILITY + 10, today - 2);
    seedCard("b", RETENTION_STABILITY, today - 40);
    seedCard("c", RETENTION_STABILITY - 1, today - 1); // below threshold — not counted
    seedActive(today);
    render(<RunbookDashboard />);
    const headline = screen.getByLabelText(/skills in proven retention/i);
    expect(headline).toHaveTextContent("2");
    expect(screen.queryByText(/your runbook is empty/i)).not.toBeInTheDocument();
  });

  it("computes the weekly streak across active weeks", () => {
    seedCard("a", RETENTION_STABILITY, today);
    // active this week and each of the last 2 weeks (same weekday, 7 days back).
    seedActive(today);
    seedActive(today - 7);
    seedActive(today - 14);
    render(<RunbookDashboard />);
    const streak = screen.getByText(/week streak/i).closest("div")!;
    expect(streak).toHaveTextContent("3");
  });

  it("renders a 26-week contribution grid with the active day marked", () => {
    seedCard("a", RETENTION_STABILITY, today);
    seedActive(today);
    render(<RunbookDashboard />);
    const graph = screen.getByRole("img", { name: /activity heatmap/i });
    expect(graph).toBeInTheDocument();
    // 26 weeks x 7 = 182 cells (span elements inside the grid).
    expect(graph.querySelectorAll("span")).toHaveLength(26 * 7);
    // The active cell carries a "active" title for today's date.
    expect(graph.querySelector('span[title*="active"]')).toBeInTheDocument();
  });

  it("updates live when a card is graded (qc-progress channel)", () => {
    seedActive(today);
    render(<RunbookDashboard />);
    // No retained card yet → mastery 0.
    expect(screen.getByLabelText(/skills in proven retention/i)).toHaveTextContent("0");
    // Grade a card up to retention off-screen, then fire the store event.
    act(() => {
      seedCard("z", RETENTION_STABILITY + 5, today);
      window.dispatchEvent(new Event("qc-progress"));
    });
    expect(screen.getByLabelText(/skills in proven retention/i)).toHaveTextContent("1");
  });

  it("counts a completed section as an active day (wiring through progress-store)", () => {
    render(<RunbookDashboard />);
    act(() => setSectionComplete("00-prereqs", true));
    expect(localStorage.getItem(`qc:log:day:${today}`)).toBe("1");
  });

  it("grading a card also logs the day (wiring through review-store)", () => {
    act(() => gradeCard("challenge:x", "good"));
    expect(localStorage.getItem(`qc:log:day:${today}`)).toBe("1");
  });

  // Guard the calendar helpers the test itself relies on stay consistent.
  it("week helpers agree on the current week", () => {
    expect(weekOf(weekStartDay(weekOf(today)))).toBe(weekOf(today));
  });
});
