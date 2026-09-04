/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DeviceTable, TECHNOLOGIES } from "@/components/quantum/device-table";
import { DEVICES } from "@/components/quantum/devices";

/**
 * The row whose MODEL cell is `model`. Not `getByText(model)`: the Local
 * simulator's vendor and model are both "Local", so a bare text lookup matches
 * two cells in the same row.
 */
const rowFor = (model: string): HTMLElement => {
  const row = screen
    .getAllByRole("row")
    .slice(1)
    .find((r) => within(r).getAllByRole("cell")[0].textContent === model);
  if (!row) throw new Error(`no device row for model "${model}"`);
  return row;
};

describe("DeviceTable", () => {
  it("renders every device row", () => {
    render(<DeviceTable />);
    for (const device of DEVICES) {
      expect(rowFor(device.model)).toBeTruthy();
    }
  });
  it("filters by technology", () => {
    render(<DeviceTable />);
    fireEvent.change(screen.getByRole("combobox", { name: /technology/i }), { target: { value: "Trapped ion" } });
    expect(screen.getByText("Forte Enterprise")).toBeInTheDocument();
    expect(screen.queryByText("Garnet")).toBeNull();
  });

  /**
   * The load-bearing behaviour of the status column. A retired device must be
   * SHOWN AND LABELLED, never quietly dropped: 02-hardware teaches the simulator
   * ladder Local -> SV1 -> DM1 -> TN1, and a learner who comes here to look TN1
   * up has to be told AWS retired it rather than left to conclude they
   * mis-remembered the lesson.
   */
  describe("lifecycle is rendered, not hidden", () => {
    it("renders a retired device as a row marked Retired", () => {
      render(<DeviceTable />);
      const tn1 = DEVICES.find((d) => d.status === "retired")!;
      expect(rowFor(tn1.model)).toBeTruthy();
      expect(within(rowFor(tn1.model)).getByText("Retired")).toBeInTheDocument();
    });

    it("renders an offline device as Offline, not Retired", () => {
      render(<DeviceTable />);
      const offline = DEVICES.find((d) => d.status === "offline")!;
      const row = within(rowFor(offline.model));
      expect(row.getByText("Offline")).toBeInTheDocument();
      expect(row.queryByText("Retired")).toBeNull();
    });

    it("labels every row's status in text, never colour alone", () => {
      render(<DeviceTable />);
      for (const device of DEVICES) {
        const label = { online: "Online", offline: "Offline", retired: "Retired" }[device.status];
        expect(within(rowFor(device.model)).getByText(label)).toBeInTheDocument();
      }
    });

    it("announces how many listed devices are not accepting tasks", () => {
      render(<DeviceTable />);
      const notLive = DEVICES.filter((d) => d.status !== "online").length;
      expect(notLive).toBeGreaterThan(0);
      expect(screen.getByRole("status")).toHaveTextContent(
        new RegExp(`${notLive} not accepting tasks`)
      );
    });
  });
  it("announces the filtered device count and technology", () => {
    render(<DeviceTable />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: /technology/i }), { target: { value: "Trapped ion" } });
    expect(screen.getByRole("status")).toHaveTextContent(/trapped ion/i);
  });

  it("offers exactly the technologies present in the catalog", () => {
    // Derived, not hand-maintained: a new family must appear under the filter and
    // a retired one must not leave an option that yields an empty table.
    render(<DeviceTable />);
    const options = within(screen.getByRole("combobox", { name: /technology/i }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["All", ...new Set(DEVICES.map((d) => d.technology))]);
    expect(options).toEqual(TECHNOLOGIES);
  });

  describe("sort state machine", () => {
    const modelsInOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1) // drop the header row
        .map((row) => within(row).getAllByRole("cell")[0].textContent);

    // Reach the header cell through its own sort button — the th's computed
    // accessible name is ambiguous ("Gate model" also matches /model/i).
    const th = (column: RegExp) =>
      screen.getByRole("button", { name: column }).closest("th")!;
    const qubitsTh = () => th(/sort by qubits/i);

    it("sorts ascending on first click and flips to descending on the second", () => {
      render(<DeviceTable />);
      expect(qubitsTh()).toHaveAttribute("aria-sort", "none");

      fireEvent.click(screen.getByRole("button", { name: /sort by qubits/i }));
      expect(qubitsTh()).toHaveAttribute("aria-sort", "ascending");
      const lowest = [...DEVICES].sort((a, b) => a.qubits - b.qubits)[0].model;
      expect(modelsInOrder()[0]).toBe(lowest);

      fireEvent.click(screen.getByRole("button", { name: /sort by qubits/i }));
      expect(qubitsTh()).toHaveAttribute("aria-sort", "descending");
      const highest = [...DEVICES].sort((a, b) => b.qubits - a.qubits)[0].model;
      expect(modelsInOrder()[0]).toBe(highest);
    });

    it("resets to ascending and clears the previous column when a new column is sorted", () => {
      render(<DeviceTable />);
      fireEvent.click(screen.getByRole("button", { name: /sort by qubits/i }));
      fireEvent.click(screen.getByRole("button", { name: /sort by qubits/i }));
      expect(qubitsTh()).toHaveAttribute("aria-sort", "descending");

      fireEvent.click(screen.getByRole("button", { name: /sort by model/i }));
      expect(qubitsTh()).toHaveAttribute("aria-sort", "none");
      expect(th(/sort by model/i)).toHaveAttribute("aria-sort", "ascending");
      const byModel = DEVICES.map((d) => d.model).sort((a, b) => a.localeCompare(b));
      expect(modelsInOrder()).toEqual(byModel);
    });
  });

  describe("overflow scroll region", () => {
    it("adds no tab stop when the table fits", () => {
      const { container } = render(<DeviceTable />);
      const wrapper = container.querySelector(".overflow-x-auto")!;
      // jsdom reports scrollWidth === clientWidth === 0, so it does not overflow.
      expect(wrapper).not.toHaveAttribute("tabindex");
      expect(wrapper).not.toHaveAttribute("role");
    });

    it("becomes a labelled keyboard scroll region when the seven columns overflow", () => {
      const scrollSpy = jest
        .spyOn(HTMLElement.prototype, "scrollWidth", "get")
        .mockReturnValue(840);
      const clientSpy = jest
        .spyOn(HTMLElement.prototype, "clientWidth", "get")
        .mockReturnValue(343);
      try {
        const { container } = render(<DeviceTable />);
        const wrapper = container.querySelector(".overflow-x-auto")!;
        expect(wrapper).toHaveAttribute("tabindex", "0");
        expect(wrapper).toHaveAttribute("role", "region");
        expect(wrapper).toHaveAttribute("aria-label", "Scrollable device table");
        expect(wrapper.className).toContain("focus-ring");
      } finally {
        scrollSpy.mockRestore();
        clientSpy.mockRestore();
      }
    });
  });
});
