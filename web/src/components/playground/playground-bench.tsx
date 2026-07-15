"use client";

import { useEffect, useMemo, useState } from "react";
import { parseProgram, type Program } from "@/components/quantum/qsim-dsl";
import { decodeShareHash, encodeShareHash } from "@/lib/circuit-url";
import type { SavedCircuit } from "@/lib/circuit-store";
import { ComposePanel } from "./compose-panel";
import { StatePanel } from "./state-panel";
import { SamplingPanel } from "./sampling-panel";
import { HardwarePanel } from "./hardware-panel";
import { SavedPanel } from "./saved-panel";

/**
 * The bench: one source of truth (the qsim source string) fanned out to five
 * panels. No run button anywhere — at four qubits the exact statevector is
 * computationally free, so everything re-renders live per keystroke. A parse
 * error NEVER blanks the readouts: the right-hand panels keep the last-good
 * program while the Compose status line carries the error (the Quirk principle).
 *
 * The URL fragment is the save file: every valid parse rewrites #c=... (debounced)
 * so the address bar always holds a shareable, bookmarkable copy of the bench.
 */

export const DEFAULT_SOURCE = "# Bell pair — the hello-world of entanglement\nH 0\nCNOT 0 1";

const URL_DEBOUNCE_MS = 300;

export function PlaygroundBench() {
  // Initialized to the DEFAULT — never from location.hash, which the server
  // cannot see; the mount effect below applies a share payload post-hydration
  // so the prerendered shell and the first client render agree.
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [theta, setTheta] = useState(Math.PI / 2);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const parsed = useMemo(() => parseProgram(source), [source]);

  // Last-good program for the readout panels. Adjust-during-render is the
  // sanctioned derived-state pattern: `parsed` is memoized on source, so this
  // converges after one extra render and can never loop.
  const [program, setProgram] = useState<Program>(parsed);
  if (!parsed.error && parsed !== program) setProgram(parsed);

  // First mount only: a #c= share payload replaces the default. This MUST be a
  // post-hydration effect — the server can't see the fragment, so reading it
  // during render (or in a state initializer) would be a hydration mismatch on
  // every shared link. One deliberate cascade, on mount, only when a payload
  // exists (the un-shared page never re-renders from this).
  useEffect(() => {
    const payload = decodeShareHash(window.location.hash);
    if (payload) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource(payload.src);
      if (payload.name) setName(payload.name);
    }
  }, []);

  // The name that rides the share hash, the QPU handoff, and the .qasm filename.
  const circuitName = name.trim() || editing?.name || "";

  const shareHash = useMemo(
    () =>
      parsed.error
        ? null
        : encodeShareHash({ name: circuitName || undefined, src: source }),
    [parsed, circuitName, source],
  );

  useEffect(() => {
    if (shareHash === null) return; // parse errors never overwrite a good URL
    const id = setTimeout(() => {
      try {
        window.history.replaceState(null, "", `#${shareHash}`);
      } catch {
        /* history unavailable (sandboxed iframe) — the bench still works */
      }
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [shareHash]);

  const handleLoad = (c: SavedCircuit) => {
    setSource(c.src);
    setEditing({ id: c.id, name: c.name });
    setName(c.name);
  };

  return (
    // Source order (Compose -> State -> Sampling -> Hardware -> Saved) IS the
    // single-column reading order below lg; at lg the grid places Saved back
    // under Compose in the left column. No CSS `order` anywhere.
    <div className="grid animate-fade-up gap-4 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
      <div className="lg:col-span-5">
        <ComposePanel
          source={source}
          onSourceChange={setSource}
          onPreset={() => setEditing(null)}
          program={program}
          parsed={parsed}
          showTheta={program.hasTheta}
          theta={theta}
          onThetaChange={setTheta}
          shareHash={shareHash}
        />
      </div>

      <div className="flex flex-col gap-4 lg:col-span-7 lg:row-span-2">
        <StatePanel program={program} theta={theta} />
        <SamplingPanel program={program} theta={theta} />
        <HardwarePanel program={program} theta={theta} name={circuitName || undefined} />
      </div>

      <div className="lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:self-start">
        <SavedPanel
          source={source}
          name={name}
          onNameChange={setName}
          editing={editing}
          onLoad={handleLoad}
          onSaved={(c) => setEditing({ id: c.id, name: c.name })}
          onDeleted={(id) => setEditing((e) => (e?.id === id ? null : e))}
        />
      </div>
    </div>
  );
}
