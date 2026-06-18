/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { ThemeToggle } from "@/components/theme-toggle";

const mockSetTheme = jest.fn();
// The toggle reads resolvedTheme (always "light" | "dark"), not theme, so it
// stays correct under enableSystem. theme is included to prove it is ignored.
let mockTheme = "system";
let mockResolvedTheme = "light";

jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: mockTheme,
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockTheme = "system";
    mockResolvedTheme = "light";
    mockSetTheme.mockClear();
  });

  it("renders the toggle button once mounted, with a state-describing label", () => {
    // In React 19, useEffect runs synchronously in test environments, so mounted
    // becomes true immediately after render.
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" })
    ).toBeInTheDocument();
  });

  it("meets the 44px minimum touch target", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("min-h-11", "min-w-11");
  });

  it("announces switching to light when the resolved theme is dark", async () => {
    mockResolvedTheme = "dark";
    await act(async () => {
      render(<ThemeToggle />);
    });
    expect(
      screen.getByRole("button", { name: "Switch to light theme" })
    ).toBeInTheDocument();
  });

  it("shows the moon icon when the resolved theme is light", async () => {
    mockResolvedTheme = "light";
    let container: HTMLElement;
    await act(async () => {
      const result = render(<ThemeToggle />);
      container = result.container;
    });
    const path = container!.querySelector("svg")!.querySelector("path");
    expect(path!.getAttribute("d")).toContain("20.354");
  });

  it("shows the sun icon when the resolved theme is dark", async () => {
    mockResolvedTheme = "dark";
    let container: HTMLElement;
    await act(async () => {
      const result = render(<ThemeToggle />);
      container = result.container;
    });
    const path = container!.querySelector("svg")!.querySelector("path");
    expect(path!.getAttribute("d")).toContain("M12 3v1");
  });

  it("calls setTheme('dark') when the resolved theme is light", async () => {
    mockResolvedTheme = "light";
    await act(async () => {
      render(<ThemeToggle />);
    });
    await act(async () => {
      screen.getByRole("button").click();
    });
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme('light') when the resolved theme is dark", async () => {
    mockResolvedTheme = "dark";
    await act(async () => {
      render(<ThemeToggle />);
    });
    await act(async () => {
      screen.getByRole("button").click();
    });
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("follows resolvedTheme, not theme: theme='system' + resolved dark toggles to light", async () => {
    mockTheme = "system";
    mockResolvedTheme = "dark";
    await act(async () => {
      render(<ThemeToggle />);
    });
    const button = screen.getByRole("button", { name: "Switch to light theme" });
    await act(async () => {
      button.click();
    });
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});
