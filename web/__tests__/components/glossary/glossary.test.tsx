/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Glossary } from "@/components/glossary/glossary";
import { GlossaryEntry } from "@/components/glossary/glossary-entry";
import { GLOSSARY } from "@/lib/glossary";
import { LocaleProvider } from "@/i18n";

// Render real GlossaryEntry but stub its leaf dependencies so no ESM/app-router.
jest.mock("@/components/transition-link", () => {
  const React = require("react");
  return {
    __esModule: true,
    TransitionLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
jest.mock("@/components/glossary/inline-markdown", () => {
  const React = require("react");
  return {
    __esModule: true,
    InlineMarkdown: ({ children }: { children: string }) => React.createElement("span", null, children),
  };
});

// Mirrors glossary/page.tsx: entries are prerendered server-side and passed in;
// the client component only filters them.
const entriesEn = Object.fromEntries(
  GLOSSARY.map((t) => [t.term, <GlossaryEntry key={t.term} term={t} />]),
);
const entriesEs = entriesEn; // shape only; English copy is enough for filter tests

function renderGlossary() {
  return render(
    <LocaleProvider>
      <Glossary entriesEn={entriesEn} entriesEs={entriesEs} />
    </LocaleProvider>,
  );
}

describe("Glossary", () => {
  it("renders every seed term on first paint", () => {
    renderGlossary();
    for (const t of GLOSSARY) {
      expect(screen.getByRole("heading", { name: t.term })).toBeInTheDocument();
    }
  });

  it("narrows the visible terms as the user types", async () => {
    const user = userEvent.setup();
    renderGlossary();
    await user.type(screen.getByRole("searchbox"), "hadamard");
    expect(screen.getByRole("heading", { name: "Hadamard gate" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Qubit" })).toBeNull();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    renderGlossary();
    await user.type(screen.getByRole("searchbox"), "zzzznope");
    expect(screen.getByText(/no terms match/i)).toBeInTheDocument();
  });

  it("offers a jump link only for letters that have matches", async () => {
    const user = userEvent.setup();
    renderGlossary();
    await user.type(screen.getByRole("searchbox"), "hadamard"); // only "H" matches
    expect(screen.getByRole("link", { name: /jump to H/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /jump to A/i })).toBeNull();
  });

  it("announces the result count for assistive tech", () => {
    renderGlossary();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(`${GLOSSARY.length} terms`);
  });
});
