/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const isReviewPrefsConfigured = jest.fn(() => true);
const getReminderPrefs = jest.fn();
const setReminderPrefs = jest.fn();
jest.mock("@/lib/review-prefs-client", () => ({
  isReviewPrefsConfigured: () => isReviewPrefsConfigured(),
  getReminderPrefs: (...a: unknown[]) => getReminderPrefs(...a),
  setReminderPrefs: (...a: unknown[]) => setReminderPrefs(...a),
}));

import { ReminderPrefs } from "@/components/reminder-prefs";

describe("ReminderPrefs", () => {
  beforeEach(() => {
    isReviewPrefsConfigured.mockReset().mockReturnValue(true);
    getReminderPrefs.mockReset().mockResolvedValue({ remindersOn: false });
    setReminderPrefs.mockReset();
  });

  it("renders nothing when the prefs endpoint is not configured", () => {
    isReviewPrefsConfigured.mockReturnValue(false);
    const { container } = render(<ReminderPrefs />);
    expect(container).toBeEmptyDOMElement();
    expect(getReminderPrefs).not.toHaveBeenCalled();
  });

  it("defaults OFF (opt-in) and reflects the server's answer after loading", async () => {
    getReminderPrefs.mockResolvedValue({ remindersOn: true });
    render(<ReminderPrefs />);
    const box = screen.getByRole("checkbox", { name: /email me when review cards are due/i });
    expect(box).not.toBeChecked(); // unchecked until the server says otherwise
    expect(box).toBeDisabled(); // and inert while loading
    await waitFor(() => expect(box).toBeChecked());
    expect(screen.getByText(/reminders are on/i)).toBeInTheDocument();
  });

  it("turning it on PUTs remindersOn: true", async () => {
    setReminderPrefs.mockResolvedValue({ remindersOn: true });
    render(<ReminderPrefs />);
    const box = screen.getByRole("checkbox");
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.click(box);
    expect(setReminderPrefs).toHaveBeenCalledWith(true);
    await waitFor(() => expect(box).toBeChecked());
    expect(screen.getByText(/reminders are on/i)).toBeInTheDocument();
  });

  it("turning it off PUTs remindersOn: false", async () => {
    getReminderPrefs.mockResolvedValue({ remindersOn: true });
    setReminderPrefs.mockResolvedValue({ remindersOn: false });
    render(<ReminderPrefs />);
    const box = screen.getByRole("checkbox");
    await waitFor(() => expect(box).toBeChecked());
    fireEvent.click(box);
    expect(setReminderPrefs).toHaveBeenCalledWith(false);
    await waitFor(() => expect(box).not.toBeChecked());
    expect(screen.getByText(/reminders are off/i)).toBeInTheDocument();
  });

  it("a failed save keeps the box honest (unchanged) and says so", async () => {
    setReminderPrefs.mockRejectedValue(new Error("500"));
    render(<ReminderPrefs />);
    const box = screen.getByRole("checkbox");
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.click(box);
    await waitFor(() =>
      expect(screen.getByText(/couldn't update your reminder preference/i)).toBeInTheDocument(),
    );
    expect(box).not.toBeChecked(); // the server did not change, neither does the UI
  });

  it("states the consent terms plainly: off by default, 7-day cap, only when due", () => {
    render(<ReminderPrefs />);
    expect(screen.getByText(/off by default/i)).toBeInTheDocument();
    expect(screen.getByText(/at most one email every 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/only when cards are actually due/i)).toBeInTheDocument();
  });
});
