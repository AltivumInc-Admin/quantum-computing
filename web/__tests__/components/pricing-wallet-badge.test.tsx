/**
 * @jest-environment jsdom
 */
// web/__tests__/components/pricing-wallet-badge.test.tsx
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { WalletBadge } from "@/components/pricing/wallet-badge";
import { useWallet } from "@/components/pricing/use-wallet";
import { LocaleProvider } from "@/i18n";
import type { Wallet } from "@/lib/billing-client";

jest.mock("@/lib/billing-client", () => ({
  getWallet: jest.fn(),
  isBillingConfigured: jest.fn(),
}));
import { getWallet, isBillingConfigured } from "@/lib/billing-client";

afterEach(() => jest.clearAllMocks());

/**
 * The badge is presentational now — the page owns the single getWallet() call
 * (useWallet), because the tier cards need the same answer and two fetches for
 * one page would be two requests for one truth. The fetch behaviour it used to
 * own is exercised below through a probe that mounts the hook.
 */
function renderBadge(wallet: Wallet | null) {
  return render(
    <LocaleProvider>
      <WalletBadge wallet={wallet} />
    </LocaleProvider>,
  );
}

const PLUS: Wallet = { tier: "plus", credits: 1890, subscriptionStatus: "active" };

test("renders the balance and tier", () => {
  renderBadge(PLUS);
  const badge = screen.getByTestId("wallet-badge");
  expect(badge).toHaveTextContent("1,890 credits");
  expect(badge).toHaveTextContent("Plus plan");
});

test("wears the hero chip recipe and sets the credit figure in mono", () => {
  // The badge is the third chip in a row whose two siblings are built from the
  // after-dark tokens. It painted itself in the pre-token dialect instead —
  // border-gray-200 / dark:border-white/10 over an opaque --surface-1 — so it
  // read as a different hairline and a different fill beside two translucent
  // --field chips, in both themes. Its credit count was also the only measured
  // figure in the product not in Geist Mono.
  renderBadge(PLUS);
  const badge = screen.getByTestId("wallet-badge");
  expect(badge.className).toContain("border-(--bd)");
  expect(badge.className).toContain("bg-(--field)");
  expect(badge.className).not.toMatch(/\bgray-\d/);
  expect(screen.getByText("1,890 credits").className).toContain("font-mono");
});

test("explains why a wallet with clawback debt will not spend", () => {
  // While clawbackOwedCredits is nonzero BOTH metered backends refuse every
  // spend — their debit conditions require the attribute absent or zero — so a
  // learner in debt saw a healthy balance and nothing said why nothing worked.
  // /wallet returns the field for exactly this purpose; this was its only
  // possible consumer and it read it nowhere.
  renderBadge({ ...PLUS, clawbackOwedCredits: 250 });
  const badge = screen.getByTestId("wallet-badge");
  expect(badge).toHaveTextContent("Spending paused");
  // The reason, not just the label, and carried where AT will read it.
  expect(badge).toHaveAccessibleDescription(/250 credits owed/i);
  expect(badge).toHaveAccessibleDescription(/until that is settled/i);
  // The balance is still shown — it is real — but not in the accent that reads
  // as spendable.
  expect(badge).toHaveTextContent("1,890 credits");
  expect(badge.className).toContain("border-warm/40");
});

test("a wallet with no debt field renders exactly as before", () => {
  renderBadge(PLUS);
  const badge = screen.getByTestId("wallet-badge");
  expect(badge).not.toHaveTextContent(/paused/i);
  expect(badge).not.toHaveAttribute("aria-describedby");
  expect(badge.className).toContain("bg-(--field)");
});

test("renders nothing without a wallet", () => {
  renderBadge(null);
  expect(screen.queryByTestId("wallet-badge")).not.toBeInTheDocument();
});

describe("useWallet", () => {
  function Probe() {
    const wallet = useWallet();
    return <span data-testid="probe">{wallet ? wallet.tier : "none"}</span>;
  }

  test("fetches once when billing is configured", async () => {
    (isBillingConfigured as jest.Mock).mockReturnValue(true);
    (getWallet as jest.Mock).mockResolvedValue(PLUS);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("plus"));
    expect(getWallet).toHaveBeenCalledTimes(1);
  });

  test("never calls the API when billing is not configured", () => {
    (isBillingConfigured as jest.Mock).mockReturnValue(false);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
    expect(getWallet).not.toHaveBeenCalled();
  });

  test("stays silent when the fetch fails (signed out / transient)", async () => {
    // A pricing page must never break because the wallet did not answer.
    (isBillingConfigured as jest.Mock).mockReturnValue(true);
    (getWallet as jest.Mock).mockRejectedValue(new Error("401"));
    render(<Probe />);
    await waitFor(() => expect(getWallet).toHaveBeenCalled());
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
  });
});
