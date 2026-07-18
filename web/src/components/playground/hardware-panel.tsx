"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { compileToQasm, QASM_SUBMIT_BYTE_CAP } from "@/lib/compile-qasm";
import { writeHandoff } from "@/lib/qpu-handoff";
import { isQpuConfigured } from "@/lib/qpu-client";
import { costLabel } from "@/components/quantum/cost";
import { CopyButton } from "@/components/copy-button";
import { primaryActionClass } from "@/components/quantum/widget-ui";
import { Panel } from "@/components/workspace/panel";
import type { Program } from "@/components/quantum/qsim-dsl";
import { benchButtonClass } from "./controls";

/**
 * The exit ramp: the bench's circuit compiled to the exact OpenQASM 3.0 dialect
 * the QPU submit path has proven on IQM Garnet. Export (copy / download) is
 * ALWAYS available — learner work must leave the platform in a standard format —
 * while the real-hardware handoff is env-gated and routes through /workspace,
 * where sign-in and the cost-estimate credential live.
 */

export function HardwarePanel({
  program,
  theta,
  name,
}: {
  program: Program;
  theta: number;
  name?: string;
}) {
  const router = useRouter();
  const compiled = useMemo(() => compileToQasm(program, theta), [program, theta]);
  const configured = isQpuConfigured();
  const [handoffFailed, setHandoffFailed] = useState(false);

  const download = () => {
    if (!compiled.ok || typeof URL.createObjectURL !== "function") return;
    try {
      const url = URL.createObjectURL(new Blob([compiled.qasm], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name?.trim() || "circuit").replace(/[^\w.-]+/g, "-")}.qasm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* download unavailable in this context */
    }
  };

  const send = () => {
    if (!compiled.ok) return;
    if (writeHandoff({ qasm: compiled.qasm, name })) {
      router.push("/workspace#hardware");
    } else {
      setHandoffFailed(true);
    }
  };

  return (
    <Panel title="Hardware" id="hardware-export" sub="OpenQASM 3.0">
      {compiled.ok ? (
        <>
          <pre className="overflow-x-auto rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 font-mono text-xs leading-relaxed text-(--ink)">
            {compiled.qasm}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CopyButton getText={() => (compiled.ok ? compiled.qasm : "")} label="Copy OpenQASM" />
            <button type="button" onClick={download} className={benchButtonClass}>
              Download .qasm
            </button>
            <span
              className={`ml-auto text-xs tabular-nums ${
                compiled.bytes > QASM_SUBMIT_BYTE_CAP
                  ? "text-danger-dark dark:text-danger-light"
                  : "text-caption"
              }`}
            >
              {compiled.bytes.toLocaleString()} bytes — submit cap{" "}
              {QASM_SUBMIT_BYTE_CAP.toLocaleString()} bytes
            </span>
          </div>
        </>
      ) : (
        // With the bench feeding the last-good program (and theta always passed),
        // this only fires if the DSL and compiler ever drift — say it quietly.
        <p role="status" className="font-mono text-xs text-caption">
          {compiled.error}
        </p>
      )}

      {configured ? (
        <div className="mt-4 border-t border-(--bd) pt-4">
          <button
            type="button"
            onClick={send}
            // Over-cap circuits are a guaranteed server reject — disable BEFORE
            // the click, not after (the byte caption above turns red in step).
            disabled={
              program.gates.length === 0 ||
              !compiled.ok ||
              compiled.bytes > QASM_SUBMIT_BYTE_CAP
            }
            className={primaryActionClass}
          >
            Send to real hardware
          </button>
          {handoffFailed && (
            <p role="status" className="mt-2 text-xs text-danger-dark dark:text-danger-light">
              Could not stage the circuit for the workspace — copy the OpenQASM above
              instead.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-caption">
            Runs on IQM Garnet ({costLabel("IQM")}) — the platform pays for sponsored runs.
            Signing in, and a one-time cost-estimate credential, may come first on the
            workspace.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-caption">
          This export runs anywhere OpenQASM 3.0 is accepted — hardware submission is not
          enabled on this build.
        </p>
      )}
    </Panel>
  );
}
