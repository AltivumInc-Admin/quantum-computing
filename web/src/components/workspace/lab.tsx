"use client";

import { useRef, useState } from "react";
import { Panel } from "./panel";
import { getRepoUrl } from "@/lib/manifest";
import type { WorkspaceSection } from "@/lib/workspace";

/**
 * Z3 — THE LAB, the IDEATE surface: the JupyterLite notebooks that are the platform's
 * whole moat, and which /workspace never linked to. Section chips are a real radiogroup
 * (roving tabindex, arrow-key navigation — not clickable divs), each tinted the
 * section's hue; below them, a hairline list of THAT module's browser-runnable
 * notebooks. The header count is computed and honest. 06-hybrid-jobs (0 runnable)
 * renders an honest empty row + a GitHub link, never a dead panel.
 */
export function Lab({
  sections,
  runnableTotal,
}: {
  sections: WorkspaceSection[];
  runnableTotal: number;
}) {
  const [selected, setSelected] = useState(0);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = sections[selected];

  const move = (next: number) => {
    const i = (next + sections.length) % sections.length;
    setSelected(i);
    chipRefs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(i - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(sections.length - 1);
        break;
    }
  };

  return (
    <Panel
      title="The lab"
      id="ws-lab"
      sub={`${runnableTotal} notebooks run in-browser`}
    >
      {/* The chips are the one wide element in this column — they scroll within their
          own track so the page body never scrolls horizontally. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div role="radiogroup" aria-label="Curriculum section" className="flex gap-2">
          {sections.map((s, i) => {
            // Chip label from the real manifest title (correctly cased), not the
            // slug — slug-recasing turned "04-quantum-ml" into "Quantum Ml". Trim
            // a leading "Quantum " and any ": subtitle" so the chip stays tight;
            // the full title is the accessible name + tooltip below.
            const label = s.title.replace(/:.*$/, "").replace(/^Quantum\s+/, "");
            const short = `${String(s.index).padStart(2, "0")} ${label}`;
            const on = i === selected;
            return (
              <button
                key={s.slug}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                title={s.title}
                aria-label={s.title}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                style={{ "--hue": s.hue } as React.CSSProperties}
                className={`shrink-0 whitespace-nowrap rounded-chip border px-2.5 py-1 text-xs font-semibold interactive focus-ring ${
                  on
                    ? "hue-border hue-soft-bg hue-text"
                    : "border-gray-200 text-gray-600 dark:border-white/[0.08] dark:text-gray-300"
                }`}
              >
                {short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 border-t border-gray-200/60 pt-1 dark:border-white/[0.06]">
        {active.runnable.length > 0 ? (
          <ul className="flex flex-col text-sm">
            {active.runnable.map((nb) => (
              <li
                key={nb.filename}
                className="flex items-center gap-3 border-t border-gray-200/60 py-2 first:border-t-0 dark:border-white/[0.06]"
              >
                <span className="min-w-[1.4rem] shrink-0 font-semibold tabular-nums text-caption">
                  {nb.index}
                </span>
                <span className="min-w-0 flex-1 truncate capitalize text-gray-700 dark:text-gray-200">
                  {nb.label}
                </span>
                <a
                  href={nb.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold text-accent-dark dark:text-accent-light interactive focus-ring rounded-control"
                  aria-label={`Open ${nb.label} in the browser lab`}
                >
                  Open ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-caption">
            No browser-runnable notebooks in this module.{" "}
            <a
              href={`${getRepoUrl()}/tree/main/${active.dirName}/notebooks`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-dark dark:text-accent-light interactive focus-ring rounded-control"
            >
              View on GitHub ↗
            </a>
          </p>
        )}
      </div>
    </Panel>
  );
}
