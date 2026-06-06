/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { ThemeToggle } from "@/components/theme-toggle";

const mockSetTheme = jest.fn();
let mockTheme = "light";

jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockTheme = "light";
    mockSetTheme.mockClear();
  });

  it("should render the toggle button once mounted (useEffect sets mounted to true)", () => {
    // In React 19, useEffect runs synchronously in test environments,
    // so mounted becomes true immediately after render.
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("meets the 44px minimum touch target", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Toggle theme" });
    expect(button).toHaveClass("min-h-11", "min-w-11");
  });

  it("should render a button with aria-label after mounting", async () => {
    await act(async () => {
      render(<ThemeToggle />);
    });
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("should render the moon icon when theme is light", async () => {
    mockTheme = "light";
    let container: HTMLElement;
    await act(async () => {
      const result = render(<ThemeToggle />);
      container = result.container;
    });
    // Moon icon path for light theme (path contains the moon arc)
    const svg = container!.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const path = svg!.querySelector("path");
    expect(path!.getAttribute("d")).toContain("20.354");
  });

  it("should render the sun icon when theme is dark", async () => {
    mockTheme = "dark";
    let container: HTMLElement;
    await act(async () => {
      const result = render(<ThemeToggle />);
      container = result.container;
    });
    const svg = container!.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const path = svg!.querySelector("path");
    expect(path!.getAttribute("d")).toContain("M12 3v1");
  });

  it("should call setTheme with 'dark' when current theme is light", async () => {
    mockTheme = "light";
    await act(async () => {
      render(<ThemeToggle />);
    });
    const button = screen.getByRole("button", { name: "Toggle theme" });
    await act(async () => {
      button.click();
    });
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("should call setTheme with 'light' when current theme is dark", async () => {
    mockTheme = "dark";
    await act(async () => {
      render(<ThemeToggle />);
    });
    const button = screen.getByRole("button", { name: "Toggle theme" });
    await act(async () => {
      button.click();
    });
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});
