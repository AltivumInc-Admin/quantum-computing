/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-top-up.test.tsx
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopUp } from "@/components/pricing/top-up";
import { LocaleProvider } from "@/i18n";

// Only the network call is stubbed. The bounds come from the REAL published
// constants: mocking them as fresh literals decoupled this suite from the source
// of truth, so a change to the published floor could not redden the widget test.
jest.mock("@/lib/billing-client", () => {
  const pricing = jest.requireActual("@/lib/pricing");
  return {
    startTopUp: jest.fn(),
    TOPUP_MIN_USD: pricing.TOPUP_MIN_USD,
    TOPUP_MAX_USD: pricing.TOPUP_MAX_USD,
    BillingAuthError: class BillingAuthError extends Error {
      constructor() {
        super("not signed in");
        this.name = "BillingAuthError";
      }
    },
  };
});
import { startTopUp, BillingAuthError } from "@/lib/billing-client";

let navigate: jest.Mock;
beforeEach(() => {
  navigate = jest.fn();
});
afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

/**
 * Rendered under a real LocaleProvider, always. The suite used to render the
 * component bare, which made every English assertion pass whether the string
 * came from the dictionary or from a literal in the component — which is exactly
 * how the hardcoded English failure message survived beside a localized sibling.
 */
function renderTopUp(locale: "en" | "es" = "en") {
  cleanup();
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <TopUp navigate={navigate} />
    </LocaleProvider>,
  );
}

test("defaults to $20 and shows the credit preview on the buy button", () => {
  renderTopUp();
  expect(screen.getByLabelText("Custom amount (USD)")).toHaveValue(20);
  expect(screen.getByRole("button", { name: "Buy 2,000 credits" })).toBeEnabled();
});

test("a preset chip fills the amount and updates the preview", async () => {
  renderTopUp();
  await userEvent.click(screen.getByRole("button", { name: "$100" }));
  expect(screen.getByLabelText("Custom amount (USD)")).toHaveValue(100);
  expect(screen.getByRole("button", { name: "Buy 10,000 credits" })).toBeEnabled();
});

test("a custom amount starts checkout for exactly that amount", async () => {
  (startTopUp as jest.Mock).mockResolvedValue("https://checkout.stripe.com/c/pay/cs_x");
  renderTopUp();
  const input = screen.getByLabelText("Custom amount (USD)");
  await userEvent.clear(input);
  await userEvent.type(input, "37");
  await userEvent.click(screen.getByRole("button", { name: "Buy 3,700 credits" }));
  expect(startTopUp).toHaveBeenCalledWith(37);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_x"));
});

test("out-of-range and fractional amounts disable the buy button with a hint", async () => {
  renderTopUp();
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
  renderTopUp();
  await userEvent.click(screen.getByRole("button", { name: "Buy 2,000 credits" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?mode=signup"));
});

test("a failed checkout surfaces a retry message", async () => {
  (startTopUp as jest.Mock).mockRejectedValue(new Error("500"));
  renderTopUp();
  await userEvent.click(screen.getByRole("button", { name: "Buy 2,000 credits" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not start checkout/i);
  expect(navigate).not.toHaveBeenCalled();
});

test("the failure message is localized, not a hardcoded English literal", async () => {
  // The English assertion above passes either way, which is how the literal
  // survived. Rendering in Spanish is what distinguishes the dictionary from a
  // string typed into the component.
  (startTopUp as jest.Mock).mockRejectedValue(new Error("500"));
  renderTopUp("es");
  await userEvent.click(screen.getByRole("button", { name: "Comprar 2,000 créditos" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /no se pudo iniciar el checkout/i,
  );
});
