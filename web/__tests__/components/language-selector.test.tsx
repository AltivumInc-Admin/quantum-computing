/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSelector } from "@/components/language-selector";
import { LocaleProvider } from "@/i18n";
import { LOCALE_STORAGE_KEY } from "@/i18n";

function renderSelector() {
  return render(
    <LocaleProvider>
      <LanguageSelector />
    </LocaleProvider>,
  );
}

describe("LanguageSelector", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
  });

  it("renders the current locale code", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: /language/i })).toHaveTextContent("EN");
  });

  it("opens a menu and switches to Spanish", () => {
    renderSelector();
    fireEvent.click(screen.getByRole("button", { name: /language/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /español/i }));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(screen.getByRole("button", { name: /idioma/i })).toHaveTextContent("ES");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderSelector();
    const trigger = screen.getByRole("button", { name: /language/i });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
