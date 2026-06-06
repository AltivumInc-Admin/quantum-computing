/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeBlock } from "@/components/code-block";

describe("CodeBlock", () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("renders the highlighted code children (preserves syntax tokens)", () => {
    render(
      <CodeBlock rawText="print('hi')" language="python">
        <code className="hljs">print(&apos;hi&apos;)</code>
      </CodeBlock>
    );
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });

  it("shows an uppercased language chip", () => {
    render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    expect(screen.getByText("PYTHON")).toBeInTheDocument();
  });

  it("omits the chip for plain text / no language", () => {
    render(
      <CodeBlock rawText="x" language="text">
        <code>x</code>
      </CodeBlock>
    );
    expect(screen.queryByText("TEXT")).not.toBeInTheDocument();
  });

  it("copies the exact raw source (not the chip or token markup)", () => {
    render(
      <CodeBlock rawText={"a\nb"} language="python">
        <code>a b</code>
      </CodeBlock>
    );
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("a\nb");
  });

  it("toggles word wrap on the code block", () => {
    const { container } = render(
      <CodeBlock rawText="x" language="python">
        <code>x</code>
      </CodeBlock>
    );
    const pre = container.querySelector("pre")!;
    expect(pre.className).toContain("whitespace-pre");
    expect(pre.className).not.toContain("whitespace-pre-wrap");
    fireEvent.click(screen.getByRole("button", { name: /wrap/i }));
    expect(pre.className).toContain("whitespace-pre-wrap");
  });
});
