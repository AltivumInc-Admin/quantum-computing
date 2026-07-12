"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: number;
}

// Monaco can't render on the server (it needs `window`) and is heavy, so it is
// dynamically imported client-only. @monaco-editor/react fetches the editor core
// from a CDN on first mount — nothing extra ships in the static export bundle,
// mirroring how the Pyodide runtime loads.
// loading fills its parent (h-full) so the placeholder always matches the
// editor's height — no layout shift on mount regardless of the height prop.
const Monaco = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-900/60 text-sm text-caption">
      Loading editor…
    </div>
  ),
});

export function CodeEditor({
  value,
  onChange,
  language = "python",
  height = 260,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div style={{ height }}>
      <Monaco
        height="100%"
        language={language}
        value={value}
        onChange={(next) => onChange(next ?? "")}
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
    </div>
  );
}
