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
    fireEvent.change(screen.getByLabelText(/technology/i), { target: { value: "Trapped ion" } });
    expect(screen.getByText("Aria")).toBeInTheDocument();
    expect(screen.queryByText("Garnet")).toBeNull();
  });
});
