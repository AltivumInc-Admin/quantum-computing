/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-top-up.test.tsx
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopUp } from "@/components/pricing/top-up";

jest.mock("@/lib/billing-client", () => ({
  startTopUp: jest.fn(),
  TOPUP_MIN_USD: 5,
  TOPUP_MAX_USD: 500,
  BillingAuthError: class BillingAuthError extends Error {
    constructor() {
      super("not signed in");
      this.name = "BillingAuthError";
    }
  },
}));
import { startTopUp, BillingAuthError } from "@/lib/billing-client";

let navigate: jest.Mock;
beforeEach(() => {
  navigate = jest.fn();
});
afterEach(() => jest.clearAllMocks());

test("defaults to $20 and shows the credit preview on the buy button", () => {
  render(<TopUp navigate={navigate} />);
  expect(screen.getByLabelText("Custom amount (USD)")).toHaveValue(20);
  expect(screen.getByRole("button", { name: "Buy 2,000 credits" })).toBeEnabled();
});

test("a preset chip fills the amount and updates the preview", async () => {
  render(<TopUp navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "$100" }));
  expect(screen.getByLabelText("Custom amount (USD)")).toHaveValue(100);
  expect(screen.getByRole("button", { name: "Buy 10,000 credits" })).toBeEnabled();
});

test("a custom amount starts checkout for exactly that amount", async () => {
  (startTopUp as jest.Mock).mockResolvedValue("https://checkout.stripe.com/c/pay/cs_x");
  render(<TopUp navigate={navigate} />);
  const input = screen.getByLabelText("Custom amount (USD)");
  await userEvent.clear(input);
  await userEvent.type(input, "37");
  await userEvent.click(screen.getByRole("button", { name: "Buy 3,700 credits" }));
  expect(startTopUp).toHaveBeenCalledWith(37);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_x"));
});

test("out-of-range and fractional amounts disable the buy button with a hint", async () => {
  render(<TopUp navigate={navigate} />);
  const input = screen.getByLabelText("Custom amount (USD)");
  for (const bad of ["3", "501", "12.5"]) {
    await userEvent.clear(input);
    await userEvent.type(input, bad);
    expect(screen.getByRole("button", { name: "Buy credits" })).toBeDisabled();
    expect(screen.getByText(/whole dollar amount from \$5 to \$500/i)).toBeInTheDocument();
  }
  expect(startTopUp).not.toHaveBeenCalled();
});

test("a signed-out click routes to sign-up", async () => {
  (startTopUp as jest.Mock).mockRejectedValue(new BillingAuthError());
  render(<TopUp navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Buy 2,000 credits" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?mode=signup"));
});

test("a failed checkout surfaces a retry message", async () => {
  (startTopUp as jest.Mock).mockRejectedValue(new Error("500"));
  render(<TopUp navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Buy 2,000 credits" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not start checkout/i);
  expect(navigate).not.toHaveBeenCalled();
});
