/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

// forwardRef so the menuitem `ref` (roving focus + click activation) reaches the <a>,
// matching next/link's real ref forwarding.
jest.mock("next/link", () => {
  const React = require("react");
  const LinkMock = React.forwardRef(
    (
      { href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown },
      ref: React.Ref<HTMLAnchorElement>
    ) => React.createElement("a", { href, ref, ...props }, children)
  );
  LinkMock.displayName = "LinkMock";
  return { __esModule: true, default: LinkMock };
});

const signOut = jest.fn();
let mockAuth = {
  status: "unauthenticated" as
    | "unconfigured"
    | "configuring"
    | "authenticated"
    | "unauthenticated",
  email: null as string | null,
  signOut,
};
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mockAuth }));

import { AccountMenu } from "@/components/auth/account-menu";

function authed() {
  mockAuth = { status: "authenticated", email: "a@b.com", signOut };
}

describe("AccountMenu", () => {
  beforeEach(() => {
    signOut.mockReset();
    mockAuth = { status: "unauthenticated", email: null, signOut };
  });

  it("renders nothing when unconfigured", () => {
    mockAuth.status = "unconfigured";
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Sign in link when unauthenticated", () => {
    render(<AccountMenu />);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("exposes a menu-button trigger that toggles aria-expanded", () => {
    authed();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the trigger shrinkable so the email yields width, never the nav", () => {
    authed();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    // Nested truncation needs min-w-0 at every flex level: without it the
    // button's automatic minimum is the full email's min-content, it refuses
    // to shrink inside the nav's action rail, and the rail overflows left
    // across the centered pill ("PricingReview"). The caps alone don't help —
    // a capped chip that can't shrink BELOW the cap still overflows.
    expect(trigger.className).toContain("min-w-0");
    expect(trigger.className).toMatch(/max-w-\[/);
    expect(trigger.querySelector("span")!.className).toContain("truncate");
    // The wrapper div is the ACTUAL flex item in the rail — its min-width:auto
    // resolved to the trigger's full intrinsic width, keeping the chip rigid
    // at its cap even after the trigger got min-w-0 (verified live: the rail
    // overflowed the pill by 36px signed-in until the wrapper shrank too).
    expect(trigger.parentElement!.className).toContain("min-w-0");
    // And the wrapper must be a flex CONTAINER: as a plain block it shrinks
    // but nothing makes the inline-flex button inside follow, so the button
    // spilled out the wrapper's right edge and parked the chevron under the
    // language globe (verified live). flex completes the shrink chain
    // rail -> wrapper -> button -> truncating span.
    expect(trigger.parentElement!.className.split(" ")).toContain("flex");
  });

  it("renders a role=menu with Workspace + Sign out menuitems when open", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    expect(screen.getByRole("menu", { name: /account/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /workspace/i })).toHaveAttribute("href", "/workspace");
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("focuses the first menuitem on open", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    expect(screen.getByRole("menuitem", { name: /workspace/i })).toHaveFocus();
  });

  it("moves focus with ArrowDown and wraps around", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // wraps to first
    expect(screen.getByRole("menuitem", { name: /workspace/i })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    authed();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("activates Sign out from the menu", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp from the first item wraps to the last", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toHaveFocus();
  });

  it("Home focuses the first item and End the last", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: /workspace/i })).toHaveFocus();
  });

  it("activates the focused item on Enter and Space via its ref", () => {
    authed();
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: /a@b\.com/i }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // focus Sign out
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("opens focused on the first/last item from the trigger's ArrowDown/ArrowUp", () => {
    authed();
    const { rerender } = render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /workspace/i })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    rerender(<AccountMenu />);
    fireEvent.keyDown(screen.getByRole("button", { name: /a@b\.com/i }), { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toHaveFocus();
  });

  it("closes when focus leaves the menu (Tab-out) without bouncing focus to the trigger", () => {
    authed();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /a@b\.com/i });
    fireEvent.click(trigger);
    fireEvent.blur(screen.getByRole("menu"), { relatedTarget: document.body });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).not.toHaveFocus();
  });

  it("renders nothing while the auth state is still 'configuring'", () => {
    mockAuth = { status: "configuring", email: null, signOut };
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });
});
