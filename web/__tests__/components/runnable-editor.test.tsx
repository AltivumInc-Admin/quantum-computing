/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunnableEditor } from "@/components/quantum/runnable-editor";
import { runPython } from "@/lib/pyodide-run";

// Swap Monaco for a plain textarea so the editor is driveable in jsdom.
jest.mock("@/components/code-editor", () => ({
  CodeEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="code editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

jest.mock("@/lib/pyodide-run", () => ({ runPython: jest.fn() }));
const mockRunPython = runPython as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe("RunnableEditor", () => {
  it("seeds the editor with the fenced source", () => {
    render(<RunnableEditor source="print('hi')" />);
    expect(screen.getByRole("textbox")).toHaveValue("print('hi')");
  });

  it("runs the current code and shows its output", async () => {
    mockRunPython.mockResolvedValue({ ok: true, output: "42\n" });
    render(<RunnableEditor source="print(6 * 7)" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(await screen.findByText(/42/)).toBeInTheDocument();
    expect(mockRunPython).toHaveBeenCalledWith("print(6 * 7)");
  });

  it("surfaces a runtime error", async () => {
    mockRunPython.mockResolvedValue({
      ok: false,
      output: "",
      error: "NameError: name 'x' is not defined",
    });
    render(<RunnableEditor source="print(x)" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(await screen.findByText(/NameError/)).toBeInTheDocument();
  });

  it("resets the editor back to the original source", () => {
    render(<RunnableEditor source="print('original')" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "print('edited')" },
    });
    expect(screen.getByRole("textbox")).toHaveValue("print('edited')");
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByRole("textbox")).toHaveValue("print('original')");
  });

  it("keeps an output status region mounted before any run (for screen readers)", () => {
    render(<RunnableEditor source="print(1)" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not resurrect output from a run the learner reset away", async () => {
    let resolve!: (v: { ok: boolean; output: string }) => void;
    mockRunPython.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<RunnableEditor source="print('x')" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    await act(async () => {
      resolve({ ok: true, output: "STALE OUTPUT\n" });
    });
    expect(screen.queryByText(/STALE OUTPUT/)).not.toBeInTheDocument();
  });

  it("disables Run while the code is executing", async () => {
    let resolve!: (v: { ok: boolean; output: string }) => void;
    mockRunPython.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<RunnableEditor source="print(1)" />);
    const runButton = screen.getByRole("button", { name: /run/i });
    fireEvent.click(runButton);
    await waitFor(() => expect(runButton).toBeDisabled());
    resolve({ ok: true, output: "1\n" });
    await waitFor(() => expect(runButton).not.toBeDisabled());
  });
});
