/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-checkout-button.test.tsx
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutButton } from "@/components/pricing/checkout-button";

jest.mock("@/lib/billing-client", () => ({
  startCheckout: jest.fn(),
  // instanceof must work in the component, so mirror a real Error subclass
  BillingAuthError: class BillingAuthError extends Error {
    constructor() {
      super("not signed in");
      this.name = "BillingAuthError";
    }
  },
}));
import { startCheckout, BillingAuthError } from "@/lib/billing-client";

let navigate: jest.Mock;
beforeEach(() => {
  navigate = jest.fn();
});
afterEach(() => jest.clearAllMocks());

test("clicking sends the browser to the returned Checkout URL", async () => {
  (startCheckout as jest.Mock).mockResolvedValue("https://checkout.stripe.com/c/pay/cs_1");
  render(<CheckoutButton lookupKey="ql_plus_monthly" label="Get Plus" navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Get Plus" }));
  expect(startCheckout).toHaveBeenCalledWith("ql_plus_monthly");
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1"));
});

test("a signed-out click routes to sign-up instead of erroring", async () => {
  (startCheckout as jest.Mock).mockRejectedValue(new BillingAuthError());
  render(<CheckoutButton lookupKey="ql_pro_monthly" label="Get Pro" navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Get Pro" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?mode=signup"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed checkout shows a retry message and keeps the button reachable", async () => {
  (startCheckout as jest.Mock).mockRejectedValue(new Error("500"));
  render(<CheckoutButton lookupKey="ql_plus_monthly" label="Get Plus" navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Get Plus" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not start checkout/i);
  expect(navigate).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "Get Plus" });
  expect(button).toBeEnabled();
  // The alert asks for a retry, so the control has to still be under the
  // keyboard. `disabled={busy}` blurred it to <body> for the whole round trip
  // and nothing restored focus, which made "try again" mean "re-tab the page".
  expect(button).toHaveFocus();
});

test("a second click while busy does not start a second Checkout Session", async () => {
  // The double-submit guard that replaced `disabled={busy}`.
  let release: (url: string) => void = () => {};
  (startCheckout as jest.Mock).mockReturnValue(
    new Promise<string>((resolve) => {
      release = resolve;
    }),
  );
  render(<CheckoutButton lookupKey="ql_plus_monthly" label="Get Plus" navigate={navigate} />);
  await userEvent.click(screen.getByRole("button", { name: "Get Plus" }));
  await userEvent.click(screen.getByRole("button", { name: "Starting…" }));
  expect(startCheckout).toHaveBeenCalledTimes(1);
  release("https://checkout.stripe.com/c/pay/cs_1");
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
});
