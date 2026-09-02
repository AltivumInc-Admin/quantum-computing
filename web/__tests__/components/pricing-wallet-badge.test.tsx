/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-wallet-badge.test.tsx
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { WalletBadge } from "@/components/pricing/wallet-badge";
import { LocaleProvider } from "@/i18n";

jest.mock("@/lib/billing-client", () => ({
  getWallet: jest.fn(),
  isBillingConfigured: jest.fn(),
}));
import { getWallet, isBillingConfigured } from "@/lib/billing-client";

afterEach(() => jest.clearAllMocks());

function renderBadge() {
  return render(
    <LocaleProvider>
      <WalletBadge />
    </LocaleProvider>,
  );
}

test("renders the balance and tier once the wallet loads", async () => {
  (isBillingConfigured as jest.Mock).mockReturnValue(true);
  (getWallet as jest.Mock).mockResolvedValue({
    tier: "plus",
    credits: 1890,
    subscriptionStatus: "active",
  });
  renderBadge();
  const badge = await screen.findByTestId("wallet-badge");
  expect(badge).toHaveTextContent("1,890 credits");
  expect(badge).toHaveTextContent("Plus plan");
});

test("wears the hero chip recipe and sets the credit figure in mono", async () => {
  // The badge is the third chip in a row whose two siblings are built from the
  // after-dark tokens. It painted itself in the pre-token dialect instead —
  // border-gray-200 / dark:border-white/10 over an opaque --surface-1 — so it
  // read as a different hairline and a different fill beside two translucent
  // --field chips, in both themes. Its credit count was also the only measured
  // figure in the product not in Geist Mono.
  (isBillingConfigured as jest.Mock).mockReturnValue(true);
  (getWallet as jest.Mock).mockResolvedValue({
    tier: "plus",
    credits: 1890,
    subscriptionStatus: "active",
  });
  renderBadge();
  const badge = await screen.findByTestId("wallet-badge");
  expect(badge.className).toContain("border-(--bd)");
  expect(badge.className).toContain("bg-(--field)");
  expect(badge.className).not.toMatch(/\bgray-\d/);
  const figure = screen.getByText("1,890 credits");
  expect(figure.className).toContain("font-mono");
});

test("renders nothing when billing is not configured (never calls the API)", () => {
  (isBillingConfigured as jest.Mock).mockReturnValue(false);
  renderBadge();
  expect(screen.queryByTestId("wallet-badge")).not.toBeInTheDocument();
  expect(getWallet).not.toHaveBeenCalled();
});

test("stays silent when the wallet fetch fails (signed out / transient)", async () => {
  (isBillingConfigured as jest.Mock).mockReturnValue(true);
  (getWallet as jest.Mock).mockRejectedValue(new Error("401"));
  renderBadge();
  await waitFor(() => expect(getWallet).toHaveBeenCalled());
  expect(screen.queryByTestId("wallet-badge")).not.toBeInTheDocument();
});
