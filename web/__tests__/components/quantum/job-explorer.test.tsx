/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { JobExplorer } from "@/components/quantum/job-explorer";
import { dispatchableDevices } from "@/components/quantum/devices";

// jsdom does not implement matchMedia; the widget's reduced-motion hook needs it.
function mockMatchMedia(reduced: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe("JobExplorer", () => {
  it("exposes named wall-clock and cost bars for both panels (SubBar extraction lock)", () => {
    render(<JobExplorer source="" />);
    expect(screen.getAllByRole("img", { name: /wall-clock bar/i })).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: /cost bar/i })).toHaveLength(2);
  });
  beforeEach(() => mockMatchMedia(false));

  it("renders the header from an empty source (defaults)", () => {
    render(<JobExplorer source="" />);
    expect(screen.getByText("Standalone vs Hybrid Job")).toBeInTheDocument();
  });

  it("renders the header from a valid JSON source", () => {
    render(
      <JobExplorer
        source={JSON.stringify({
          iterations: 60,
          shots: 1000,
          provider: "IonQ",
          instance: "ml.m5.large",
          queueWaitSec: 45,
          iterSec: 6,
        })}
      />
    );
    expect(screen.getByText("Standalone vs Hybrid Job")).toBeInTheDocument();
  });

  it("renders the qjob error card for a malformed source without throwing", () => {
    expect(() => render(<JobExplorer source="{not json" />)).not.toThrow();
    expect(screen.getByText(/qjob error:/i)).toBeInTheDocument();
  });
  it("renders the qjob error card for a non-finite numeric field", () => {
    render(<JobExplorer source={'{"iterations": 1e999}'} />);
    expect(screen.getByText(/qjob error/i)).toBeInTheDocument();
  });
  it("renders the qjob error card for a non-numeric field", () => {
    render(<JobExplorer source={'{"shots":"many"}'} />);
    expect(screen.getByText(/qjob error/i)).toBeInTheDocument();
  });

  it("shows the shot count, the dominant driver of every dollar on screen", () => {
    // At the GUIDE's 1000-shot / IonQ Forte default the per-shot term is $4,800
    // of a $4,818 total, so a shots-less header made the figure unattributable.
    render(<JobExplorer source={JSON.stringify({ shots: 1000 })} />);
    expect(screen.getByText("1000 shots")).toBeInTheDocument();
  });

  it("offers only providers with a device that is online today", () => {
    render(<JobExplorer source="" />);
    const select = screen.getByLabelText(/quantum provider/i);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    // Derived from dispatchableDevices() intersected with the per-shot rates,
    // in catalog order. Rigetti and AQT earned their place on 2026-09-04 when
    // Cepheus-1-108Q and IBEX Q1 came online.
    expect(options).toEqual([
      "IonQ",
      "AQT",
      "IQM Garnet",
      "IQM Emerald",
      "Rigetti",
      "QuEra",
    ]);
  });

  it("does not offer a backend whose devices are all retired or offline", () => {
    render(<JobExplorer source="" />);
    const select = screen.getByLabelText(/quantum provider/i);
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    // TN1 is per-minute so it was never a candidate; the real assertion is that
    // the picker is built from live devices, so a future all-offline vendor
    // drops out instead of advertising a backend the service will refuse.
    for (const v of values) {
      const live = dispatchableDevices().some((d) => d.provider === v);
      expect(live).toBe(true);
    }
  });

  it("carries the rounded minute into the hour instead of rendering '1h 60m'", () => {
    // 10 iterations x (600s queue + 119.9s compute) = 7199s standalone, whose
    // remainder past the hour rounds to 60 minutes.
    render(
      <JobExplorer
        source={JSON.stringify({ iterations: 10, queueWaitSec: 600, iterSec: 119.9 })}
      />
    );
    expect(
      screen.getByRole("img", { name: /Standalone tasks wall-clock bar: 2h\./ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /60m/ })).not.toBeInTheDocument();
  });

  it("never renders a real charge as $0.00 (sub-cent instance deltas)", () => {
    // addedCost is pure instance charge; ml.m5.large needs ~156s of wall-clock
    // to reach one displayed cent, so the whole low-iteration range used to
    // read "$0.00" while the sentence claimed the two paths were identical.
    render(<JobExplorer source={JSON.stringify({ iterations: 1, iterSec: 6 })} />);
    const delta = screen.getByRole("status");
    expect(delta).toHaveTextContent(/adds \$0\.0021/);
  });

  it("names the container startup that sets the break-even", () => {
    render(<JobExplorer source="" />);
    expect(screen.getByText(/60s startup/)).toBeInTheDocument();
  });
});
