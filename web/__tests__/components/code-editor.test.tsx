/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

// Capture loader.config (self-host path) and the onMount wiring without booting
// real Monaco (it needs a browser + the staged /monaco/<version>/vs assets).
// That mocking is exactly why web/e2e/runnable-editor.e2e.ts exists: these
// assertions pass whether or not the staged tree is present or complete.
const mockLoaderConfig = jest.fn();
type FakeEditor = {
  addCommand: jest.Mock;
  updateOptions: jest.Mock;
  onDidFocusEditorText: jest.Mock;
};
let capturedOnMount: ((editor: FakeEditor, monaco: unknown) => void) | null = null;

jest.mock("@monaco-editor/react", () => {
  const React = require("react");
  return {
    __esModule: true,
    loader: { config: (...args: unknown[]) => mockLoaderConfig(...args) },
    default: (props: { onMount?: (editor: FakeEditor, monaco: unknown) => void }) => {
      capturedOnMount = props.onMount ?? null;
      return React.createElement("div", { "data-testid": "monaco-mock" });
    },
  };
});
jest.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

import { CodeEditor } from "@/components/code-editor";
import { MONACO_VERSION, MONACO_VS_PATH } from "@/lib/monaco-path";

const KeyCode = { Escape: 9 };
function fakeEditor(): FakeEditor {
  return {
    addCommand: jest.fn(),
    updateOptions: jest.fn(),
    onDidFocusEditorText: jest.fn(),
  };
}

afterEach(() => {
  capturedOnMount = null;
  jest.useRealTimers();
});

describe("CodeEditor", () => {
  it("points the AMD loader at the self-hosted, version-stamped monaco path (no CDN)", () => {
    // loader.config runs at module scope, before any editor mounts.
    expect(mockLoaderConfig).toHaveBeenCalledWith({ paths: { vs: MONACO_VS_PATH } });
    expect(MONACO_VS_PATH).toBe(`/monaco/${MONACO_VERSION}/vs`);
    expect(MONACO_VS_PATH).not.toMatch(/^https?:/);
  });

  it("declares the monaco version actually installed (the staged tree's directory)", () => {
    // scripts/stage-monaco.mjs stages into public/monaco/<installed version>/vs
    // and fails the build on a mismatch; this is the same guard at test time, so
    // a dependency bump without a constant bump cannot reach a deploy.
    const installed = require("monaco-editor/package.json").version as string;
    expect(MONACO_VERSION).toBe(installed);
  });

  it("renders the keyboard-exit hint adjacent to the editor", () => {
    render(<CodeEditor value="x = 1" onChange={() => {}} />);
    expect(
      screen.getByText(/press Escape, then Tab/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+M \(Ctrl\+Shift\+M on macOS\)/)).toBeInTheDocument();
  });

  it("binds Escape to arm tab-focus mode and restores Tab-indent on refocus", async () => {
    render(<CodeEditor value="x = 1" onChange={() => {}} />);
    await screen.findByTestId("monaco-mock"); // dynamic chunk resolved
    expect(capturedOnMount).not.toBeNull();

    const editor = fakeEditor();
    act(() => capturedOnMount!(editor, { KeyCode }));

    // Escape command registered with a precondition that defers to the
    // suggest/find widgets' own Escape handling.
    const [key, run, when] = editor.addCommand.mock.calls[0];
    expect(key).toBe(KeyCode.Escape);
    expect(when).toMatch(/suggestWidgetVisible/);
    run();
    expect(editor.updateOptions).toHaveBeenCalledWith({ tabFocusMode: true });

    // Refocusing the editor text puts Tab back to indenting.
    const refocus = editor.onDidFocusEditorText.mock.calls[0][0];
    refocus();
    expect(editor.updateOptions).toHaveBeenLastCalledWith({ tabFocusMode: false });
  });

  it("gives a slow link the full load budget before declaring failure", () => {
    // The critical path is ~1.08 MB gzipped (see LOAD_TIMEOUT_MS's comment), so
    // an ordinary slow connection must not be failed at the old 15s mark.
    jest.useFakeTimers();
    render(<CodeEditor value="x = 1" onChange={() => {}} />);
    act(() => jest.advanceTimersByTime(20_000));
    expect(screen.queryByText(/couldn't load the editor/i)).not.toBeInTheDocument();
  });

  it("replaces a never-mounting editor with an explicit error state + reload retry", () => {
    jest.useFakeTimers();
    render(<CodeEditor value="x = 1" onChange={() => {}} />);
    expect(screen.queryByText(/couldn't load the editor/i)).not.toBeInTheDocument();

    act(() => jest.advanceTimersByTime(45_000));
    expect(
      screen.getByText(/couldn't load the editor\. reload the page to retry\./i)
    ).toBeInTheDocument();
    // The retry control is a real button (its handler is window.location.reload,
    // which jsdom cannot spy on — the render contract is what's assertable here).
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });

  it("does not raise the error state once the editor has mounted", async () => {
    jest.useFakeTimers();
    render(<CodeEditor value="x = 1" onChange={() => {}} />);
    // Let the dynamic import resolve under fake timers.
    await act(async () => {
      await Promise.resolve();
    });
    expect(capturedOnMount).not.toBeNull();
    act(() => capturedOnMount!(fakeEditor(), { KeyCode }));
    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.queryByText(/couldn't load the editor/i)).not.toBeInTheDocument();
  });
});
