/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceTable } from "@/components/quantum/device-table";

describe("DeviceTable", () => {
  it("renders every device row", () => {
    render(<DeviceTable />);
    expect(screen.getByText("Aria")).toBeInTheDocument();
    expect(screen.getByText("Aquila")).toBeInTheDocument();
    expect(screen.getByText("SV1")).toBeInTheDocument();
  });
  it("filters by technology", () => {
    render(<DeviceTable />);
    fireEvent.change(screen.getByRole("combobox", { name: /technology/i }), { target: { value: "Trapped ion" } });
    expect(screen.getByText("Aria")).toBeInTheDocument();
    expect(screen.queryByText("Garnet")).toBeNull();
  });
  it("announces the filtered device count and technology", () => {
    render(<DeviceTable />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: /technology/i }), { target: { value: "Trapped ion" } });
    expect(screen.getByRole("status")).toHaveTextContent(/trapped ion/i);
  });
});
