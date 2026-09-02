/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-manage-plan.test.tsx
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManagePlan } from "@/components/pricing/manage-plan";
import { LocaleProvider } from "@/i18n";

jest.mock("@/lib/billing-client", () => ({
  openPortal: jest.fn(),
  BillingAuthError: class BillingAuthError extends Error {
    constructor() {
      super("not signed in");
      this.name = "BillingAuthError";
    }
  },
}));
import { openPortal, BillingAuthError } from "@/lib/billing-client";

let navigate: jest.Mock;
beforeEach(() => {
  navigate = jest.fn();
});
afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

function renderManagePlan(locale: "en" | "es" = "en") {
  cleanup();
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <ManagePlan navigate={navigate} />
    </LocaleProvider>,
  );
}

test("marks the card as the current plan and offers the portal", () => {
  renderManagePlan();
  expect(screen.getByText("Current plan")).toBeInTheDocument();
  // ...and NOT a buy button: /checkout would open a second subscription to the
  // plan the caller already holds (hasPaidTier is consulted only for mode
  // "payment"), which is what this control exists to prevent.
  expect(screen.queryByRole("button", { name: /^Get / })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage billing" })).toBeEnabled();
});

test("sends the browser to the Billing Portal URL", async () => {
  (openPortal as jest.Mock).mockResolvedValue("https://billing.stripe.com/p/1");
  renderManagePlan();
  await userEvent.click(screen.getByRole("button", { name: "Manage billing" }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/1"),
  );
});

test("a signed-out click routes to sign-up", async () => {
  (openPortal as jest.Mock).mockRejectedValue(new BillingAuthError());
  renderManagePlan();
  await userEvent.click(screen.getByRole("button", { name: "Manage billing" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login?mode=signup"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed portal open reports it and keeps the button focused", async () => {
  (openPortal as jest.Mock).mockRejectedValue(new Error("500"));
  renderManagePlan();
  await userEvent.click(screen.getByRole("button", { name: "Manage billing" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/billing portal/i);
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Manage billing" })).toHaveFocus();
});

test("localizes both the marker and the failure", async () => {
  (openPortal as jest.Mock).mockRejectedValue(new Error("500"));
  renderManagePlan("es");
  expect(screen.getByText("Plan actual")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Gestionar la facturación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/portal de facturación/i);
});
