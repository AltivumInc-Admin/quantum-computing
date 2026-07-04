/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { VqcTrainer } from "@/components/quantum/vqc-trainer";
import { N_PARAMS } from "@/components/quantum/vqc";

describe("VqcTrainer", () => {
  it("renders the VQC header and a Train button", () => {
    render(<VqcTrainer source={JSON.stringify({ dataset: "blobs" })} />);
    expect(screen.getByText(/vqc/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /train/i })).toBeInTheDocument();
  });
  it("training advances the step readout past 0 (button runs a synchronous burst)", () => {
    render(<VqcTrainer source={""} />);
    expect(screen.getByRole("status")).toHaveTextContent(/step 0/);
    fireEvent.click(screen.getByRole("button", { name: /train/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/step [1-9]/);
  });
  it("renders the error card for an unknown dataset", () => {
    render(<VqcTrainer source={JSON.stringify({ dataset: "moons" })} />);
    expect(screen.getByText(/unknown dataset "moons"/)).toBeInTheDocument();
  });
  it("announces the step/loss/accuracy readout as a polite live region", () => {
    render(<VqcTrainer source={""} />);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(/step/i);
    expect(live).toHaveAttribute("aria-live", "polite");
  });
  it("seeds the loss curve from the model's own initial theta (one random draw, not two)", () => {
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    render(<VqcTrainer source={""} />);
    expect(spy).toHaveBeenCalledTimes(N_PARAMS);
    spy.mockRestore();
  });
});
