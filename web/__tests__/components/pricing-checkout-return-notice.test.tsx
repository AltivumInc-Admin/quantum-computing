/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-checkout-return-notice.test.tsx
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutReturnNotice } from "@/components/pricing/checkout-return-notice";
import { LocaleProvider } from "@/i18n";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/pricing${search}`);
}

afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  setSearch("");
});

function renderNotice(outcome: "success" | "cancelled", locale: "en" | "es" = "en") {
  cleanup();
  localStorage.setItem("qc:locale", locale);
  return render(
    <LocaleProvider>
      <CheckoutReturnNotice outcome={outcome} />
    </LocaleProvider>,
  );
}

test("renders nothing on a fresh visit", () => {
  renderNotice("cancelled");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("renders nothing for the other outcome", () => {
  setSearch("?checkout=success");
  renderNotice("cancelled");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("acknowledges a cancelled checkout and says nothing was charged", () => {
  setSearch("?checkout=cancelled");
  renderNotice("cancelled");
  expect(screen.getByRole("status")).toHaveTextContent(/nothing was charged/i);
});

test("confirms a payment WITHOUT claiming the credits have landed", () => {
  // The webhook grants them, so at this moment the balance may not have moved.
  // Saying "added" here would be the same overstatement the pricing copy is
  // guarded against everywhere else.
  setSearch("?checkout=success");
  renderNotice("success");
  const notice = screen.getByRole("status");
  expect(notice).toHaveTextContent(/payment received/i);
  expect(notice).toHaveTextContent(/on the way/i);
  expect(notice).not.toHaveTextContent(/added to your wallet|already in your wallet/i);
});

test("strips the parameter so a reload does not re-announce the purchase", async () => {
  setSearch("?checkout=success&utm=x");
  renderNotice("success");
  await waitFor(() => expect(window.location.search).toBe("?utm=x"));
  expect(window.location.pathname).toBe("/pricing");
});

test("can be dismissed", async () => {
  setSearch("?checkout=cancelled");
  renderNotice("cancelled");
  await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("speaks both shipped locales", () => {
  setSearch("?checkout=success");
  renderNotice("success", "es");
  expect(screen.getByRole("status")).toHaveTextContent(/en camino/i);
});
