/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-wallet-badge.test.tsx
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { WalletBadge } from "@/components/pricing/wallet-badge";

jest.mock("@/lib/billing-client", () => ({
  getWallet: jest.fn(),
  isBillingConfigured: jest.fn(),
}));
import { getWallet, isBillingConfigured } from "@/lib/billing-client";

afterEach(() => jest.clearAllMocks());

test("renders the balance and tier once the wallet loads", async () => {
  (isBillingConfigured as jest.Mock).mockReturnValue(true);
  (getWallet as jest.Mock).mockResolvedValue({ tier: "plus", credits: 1890, subscriptionStatus: "active" });
  render(<WalletBadge />);
  const badge = await screen.findByTestId("wallet-badge");
  expect(badge).toHaveTextContent("1,890 credits");
  expect(badge).toHaveTextContent("Plus plan");
});

test("renders nothing when billing is not configured (never calls the API)", () => {
  (isBillingConfigured as jest.Mock).mockReturnValue(false);
  render(<WalletBadge />);
  expect(screen.queryByTestId("wallet-badge")).not.toBeInTheDocument();
  expect(getWallet).not.toHaveBeenCalled();
});

test("stays silent when the wallet fetch fails (signed out / transient)", async () => {
  (isBillingConfigured as jest.Mock).mockReturnValue(true);
  (getWallet as jest.Mock).mockRejectedValue(new Error("401"));
  render(<WalletBadge />);
  await waitFor(() => expect(getWallet).toHaveBeenCalled());
  expect(screen.queryByTestId("wallet-badge")).not.toBeInTheDocument();
});
