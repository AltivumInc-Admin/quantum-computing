/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunnableEditor } from "@/components/quantum/runnable-editor";
import { runPython } from "@/lib/pyodide-run";
import {
  isPyodideBooted,
  PY_BOOT_NOTICE,
  PY_BOOT_SLOW_NOTICE,
  PY_RUNNING_NOTICE,
  PY_RUNNING_SLOW_NOTICE,
  PY_SLOW_NOTICE_MS,
} from "@/lib/pyodide-runtime";

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
// The status copy + the boot-vs-execute split come from the real runtime module;
// only the "is an interpreter already up?" predicate is scripted per test.
jest.mock("@/lib/pyodide-runtime", () => {
  const actual = jest.requireActual("@/lib/pyodide-runtime");
  return { ...actual, isPyodideBooted: jest.fn(() => false) };
});
const mockRunPython = runPython as jest.Mock;
const mockIsBooted = isPyodideBooted as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockIsBooted.mockReturnValue(false);
});

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
    let resolve!: (v: { output: string }) => void;
    mockRunPython.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<RunnableEditor source="print(1)" />);
    const runButton = screen.getByRole("button", { name: /run/i });
    fireEvent.click(runButton);
    await waitFor(() => expect(runButton).toBeDisabled());
    resolve({ output: "1\n" });
    await waitFor(() => expect(runButton).not.toBeDisabled());
  });

  it("keeps Run disabled after a Reset until the abandoned run actually settles", async () => {
    // Reset cannot cancel the worker. Re-enabling Run would queue the next run
    // behind the abandoned one on the module-global FIFO, so the learner would
    // watch a trivial snippet hang for the rest of the first run's 30s budget
    // and then be told an "earlier run timed out".
    let resolve!: (v: { output: string }) => void;
    mockRunPython.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<RunnableEditor source="print(1)" />);
    const runButton = screen.getByRole("button", { name: /run/i });
    fireEvent.click(runButton);
    await waitFor(() => expect(runButton).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(runButton).toBeDisabled();

    await act(async () => {
      resolve({ output: "STALE\n" });
    });
    // The run settled: Run is usable again and the abandoned output is discarded.
    expect(runButton).not.toBeDisabled();
    expect(screen.queryByText(/STALE/)).not.toBeInTheDocument();
  });
});

describe("RunnableEditor status copy", () => {
  function pending() {
    mockRunPython.mockReturnValue(new Promise(() => {}));
  }

  it("promises a boot only when the interpreter actually has to boot", async () => {
    pending();
    render(<RunnableEditor source="print(1)" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(await screen.findByText(PY_BOOT_NOTICE)).toBeInTheDocument();
  });

  it("says it is running, not booting, once an interpreter is cached", async () => {
    // Runs 2..N of a session boot nothing and finish in milliseconds; the boot
    // sentence described something that was not happening.
    mockIsBooted.mockReturnValue(true);
    pending();
    render(<RunnableEditor source="print(1)" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(await screen.findByText(PY_RUNNING_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(PY_BOOT_NOTICE)).not.toBeInTheDocument();
  });

  it.each([
    [false, PY_BOOT_SLOW_NOTICE],
    [true, PY_RUNNING_SLOW_NOTICE],
  ])(
    "escalates the copy rather than sitting on it (booted=%s)",
    async (booted, escalated) => {
      // The waits behind this are real: 30s for a runaway loop, up to 150s if
      // both boot origins stall.
      jest.useFakeTimers();
      mockIsBooted.mockReturnValue(booted);
      pending();
      render(<RunnableEditor source="print(1)" />);
      fireEvent.click(screen.getByRole("button", { name: /run/i }));
      expect(screen.queryByText(escalated)).not.toBeInTheDocument();
      act(() => jest.advanceTimersByTime(PY_SLOW_NOTICE_MS));
      expect(screen.getByText(escalated)).toBeInTheDocument();
    }
  );

  it("drops the escalation once a run finishes", async () => {
    mockRunPython.mockResolvedValue({ output: "1\n" });
    render(<RunnableEditor source="print(1)" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    expect(await screen.findByText(/1/)).toBeInTheDocument();
    expect(screen.queryByText(PY_BOOT_NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByText(PY_BOOT_SLOW_NOTICE)).not.toBeInTheDocument();
  });
});

describe("RunnableEditor output scroll region", () => {
  it("adds no tab stop when the output fits", async () => {
    mockRunPython.mockResolvedValue({ output: "42\n" });
    render(<RunnableEditor source="print(6 * 7)" />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    await screen.findByText(/42/);
    // jsdom reports scrollWidth === clientWidth === 0, so it does not overflow.
    const wrapper = screen.getByRole("status").parentElement!;
    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper).not.toHaveAttribute("tabindex");
    expect(wrapper).not.toHaveAttribute("role");
  });

  it("becomes a labelled keyboard scroll region when a traceback overflows", async () => {
    // The house measure-then-expose idiom: fake an overflowing layout. Python
    // tracebacks and long print lines are exactly what overflows here, and a
    // keyboard-only reader could not scroll to see them.
    const scrollSpy = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(900);
    const clientSpy = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(343);
    try {
      mockRunPython.mockResolvedValue({
        output: "",
        error: "NameError: name 'x' is not defined",
      });
      render(<RunnableEditor source="print(x)" />);
      fireEvent.click(screen.getByRole("button", { name: /run/i }));
      await screen.findByText(/NameError/);
      const wrapper = screen.getByRole("status").parentElement!;
      expect(wrapper).toHaveAttribute("tabindex", "0");
      expect(wrapper).toHaveAttribute("role", "region");
      expect(wrapper).toHaveAttribute("aria-label", "Python output");
      expect(wrapper.className).toContain("focus-ring");
      // The live region stays on the <pre>; the wrapper carries the scrolling.
      expect(screen.getByRole("status").tagName).toBe("PRE");
    } finally {
      scrollSpy.mockRestore();
      clientSpy.mockRestore();
    }
  });
});
