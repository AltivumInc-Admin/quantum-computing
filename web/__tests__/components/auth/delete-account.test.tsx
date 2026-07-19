/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signOut = jest.fn();
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", email: "a@b.com", signOut }),
}));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

const deleteProgress = jest.fn();
jest.mock("@/lib/sync-client", () => ({
  deleteProgress: (...a: unknown[]) => deleteProgress(...a),
}));

const isReviewPrefsConfigured = jest.fn(() => true);
const deleteReminderPrefs = jest.fn();
jest.mock("@/lib/review-prefs-client", () => ({
  isReviewPrefsConfigured: () => isReviewPrefsConfigured(),
  deleteReminderPrefs: (...a: unknown[]) => deleteReminderPrefs(...a),
}));

const deleteUser = jest.fn();
jest.mock("aws-amplify/auth", () => ({ deleteUser: (...a: unknown[]) => deleteUser(...a) }));

import { DeleteAccount } from "@/components/auth/delete-account";
// Real module (only sync-client is mocked): the tombstone reset under test.
import { applySnapshot, registerLocalDeletion, resetLocalDeletions } from "@/lib/progress-merge";

const openAndConfirm = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "delete" } });
  fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));
};

describe("DeleteAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_SYNC_URL = "https://sync.example";
    isReviewPrefsConfigured.mockReturnValue(true);
    deleteProgress.mockResolvedValue(undefined);
    deleteReminderPrefs.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
    signOut.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SYNC_URL;
  });

  it("requires the typed confirmation before the destructive button arms", () => {
    render(<DeleteAccount />);
    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    const confirm = screen.getByRole("button", { name: /delete my account/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "delet" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "delete" } });
    expect(confirm).toBeEnabled();
  });

  it("states plainly what will be deleted", () => {
    render(<DeleteAccount />);
    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    expect(screen.getByText(/synced progress on the server/i)).toBeInTheDocument();
    expect(screen.getByText(/email reminder preference/i)).toBeInTheDocument();
    expect(screen.getByText(/your account and sign-in/i)).toBeInTheDocument();
    expect(screen.getByText(/local copy of your progress/i)).toBeInTheDocument();
    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
  });

  it("deletes in the safe order (server progress, prefs, THEN the user), clears qc:*, signs out", async () => {
    localStorage.setItem("qc:section:a", "1");
    localStorage.setItem("qc:card:x", "{}");
    localStorage.setItem("qc-sync:meta", '{"sub":"u1"}');
    localStorage.setItem("unrelated", "keep");

    render(<DeleteAccount />);
    await openAndConfirm();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    // Ordered: no server data may outlive the account, so the Cognito user
    // goes LAST.
    const order = [
      deleteProgress.mock.invocationCallOrder[0],
      deleteReminderPrefs.mock.invocationCallOrder[0],
      deleteUser.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(localStorage.getItem("qc:section:a")).toBeNull();
    expect(localStorage.getItem("qc:card:x")).toBeNull();
    expect(localStorage.getItem("qc-sync:meta")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(signOut).toHaveBeenCalled();
  });

  it("resets session tombstones with the local wipe (a stale one would suppress the next account's first sync)", async () => {
    // Account A un-completed a section this session, then deleted the account.
    // clearLocal wipes qc-sync:meta, so sync's boundSub-mismatch branch — the
    // only other resetLocalDeletions call — can never fire for account B in
    // this same tab. Without the reset, B's first-sync applySnapshot would
    // silently skip B's own completed section under A's stale tombstone.
    registerLocalDeletion("qc:section:x");
    try {
      render(<DeleteAccount />);
      await openAndConfirm();
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
      expect(applySnapshot({ "qc:section:x": "1" })).toBe(1);
      expect(localStorage.getItem("qc:section:x")).toBe("1");
    } finally {
      resetLocalDeletions();
      localStorage.clear();
    }
  });

  it("STOPS when the progress delete fails: no further deletes, account untouched", async () => {
    deleteProgress.mockRejectedValue(new Error("500"));
    localStorage.setItem("qc:section:a", "1");

    render(<DeleteAccount />);
    await openAndConfirm();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/nothing was deleted/i),
    );
    expect(deleteReminderPrefs).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("qc:section:a")).toBe("1"); // local copy intact
  });

  it("STOPS when the prefs delete fails and says the account was NOT deleted", async () => {
    deleteReminderPrefs.mockRejectedValue(new Error("500"));

    render(<DeleteAccount />);
    await openAndConfirm();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/account was not deleted/i),
    );
    expect(deleteUser).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("reports honestly when the Cognito delete itself fails, without clearing local data", async () => {
    deleteUser.mockRejectedValue(new Error("NotAuthorizedException"));
    localStorage.setItem("qc:section:a", "1");

    render(<DeleteAccount />);
    await openAndConfirm();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /server data was deleted, but the account itself could not be deleted/i,
      ),
    );
    expect(localStorage.getItem("qc:section:a")).toBe("1");
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("skips the progress step (and its list item) when sync is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SYNC_URL;

    render(<DeleteAccount />);
    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    expect(screen.queryByText(/synced progress on the server/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(deleteProgress).not.toHaveBeenCalled();
    expect(deleteReminderPrefs).toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalled();
  });

  // WCAG 2.4.3 (focus order): opening replaces the focused trigger with a whole
  // new section, and cancelling replaces it back — focus must follow, and the
  // first render must never steal it.
  describe("focus management", () => {
    it("does not steal focus on initial mount (even under StrictMode's double-invoke)", () => {
      render(
        <StrictMode>
          <DeleteAccount />
        </StrictMode>
      );
      expect(screen.getByRole("button", { name: /^delete account$/i })).not.toHaveFocus();
    });

    it("moves focus to the section heading when the confirmation opens", () => {
      render(<DeleteAccount />);
      fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
      expect(screen.getByRole("heading", { name: /delete account/i })).toHaveFocus();
    });

    it("returns focus to the re-mounted trigger on Cancel", () => {
      render(<DeleteAccount />);
      fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(screen.getByRole("button", { name: /^delete account$/i })).toHaveFocus();
    });
  });
});
