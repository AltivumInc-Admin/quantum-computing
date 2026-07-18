"use client";

import dynamic from "next/dynamic";
import { loader, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: number;
}

// Monaco can't render on the server (it needs `window`) and is heavy, so it is
// dynamically imported client-only. The editor core itself is SELF-HOSTED:
// scripts/stage-monaco.mjs copies monaco-editor/min/vs into public/monaco/vs at
// build time (prebuild/predev hooks) and the loader below boots it from that
// same-origin path — no CDN request, mirroring the self-hosted Pyodide runtime.
loader.config({ paths: { vs: "/monaco/vs" } });

// If the editor core hasn't mounted after this long (offline, blocked asset,
// broken deploy), an explicit error state replaces the placeholder instead of
// it reading "Loading editor…" forever.
const LOAD_TIMEOUT_MS = 15_000;

// Fills its parent (h-full) so placeholder/error always match the editor's
// height — no layout shift on mount regardless of the height prop.
function EditorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 bg-(--field) px-4 text-center text-sm text-caption">
      {children}
    </div>
  );
}

const Monaco = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => <EditorNotice>Loading editor…</EditorNotice>,
});

export function CodeEditor({
  value,
  onChange,
  language = "python",
  height = 260,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!mountedRef.current) setTimedOut(true);
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    mountedRef.current = true;
    // WCAG 2.1.2 (no keyboard trap): Tab deliberately indents in a code editor,
    // so keyboard users get a bound exit — Escape arms Monaco's tab-focus mode
    // (the next Tab then moves focus out) and refocusing the editor text
    // restores Tab-as-indent. The precondition keeps Escape's built-in jobs
    // (dismissing the suggest/find widgets) ahead of ours.
    editor.addCommand(
      monaco.KeyCode.Escape,
      () => editor.updateOptions({ tabFocusMode: true }),
      "!suggestWidgetVisible && !findWidgetVisible"
    );
    editor.onDidFocusEditorText(() => editor.updateOptions({ tabFocusMode: false }));
  };

  return (
    <div>
      <div style={{ height }}>
        {timedOut ? (
          <EditorNotice>
            <p>Couldn&apos;t load the editor. Reload the page to retry.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-control border border-(--bd) px-3 py-1 text-xs font-medium text-(--mut) hover:border-accent/50 interactive focus-ring"
            >
              Reload page
            </button>
          </EditorNotice>
        ) : (
          <Monaco
            height="100%"
            language={language}
            value={value}
            onChange={(next) => onChange(next ?? "")}
            onMount={onMount}
            theme={resolvedTheme === "light" ? "light" : "vs-dark"}
            options={{
              // Monaco's internal textarea has no name otherwise; this ties it to
              // the "Run it yourself" Python sandbox for screen-reader users.
              ariaLabel: "Editable Python code",
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: "none",
              automaticLayout: true,
              tabSize: 4,
              smoothScrolling: true,
              wordWrap: "on",
            }}
          />
        )}
      </div>
      {/* Visible, SR-reachable disclosure of the keyboard exit (WCAG 2.1.2). */}
      <p className="border-t border-(--bd) px-4 py-1.5 text-[11px] leading-relaxed text-caption">
        Tab indents. To move focus out of the editor, press Escape, then Tab —
        or toggle with Ctrl+M (Ctrl+Shift+M on macOS).
      </p>
    </div>
  );
}
