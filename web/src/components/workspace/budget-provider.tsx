"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isQpuConfigured, getBudget, type Budget } from "@/lib/qpu-client";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * The ONE auth-gated budget fetch for /workspace (Z9b). It exists as a CORRECTNESS
 * FIX, not an optimisation: an empty-dep mount fetch races the lazily-loaded Amplify
 * bridge — Amplify.configure has not run, fetchAuthSession throws NotSignedIn, the
 * error is swallowed, and an earned hardware standing renders as unknown for the life
 * of the page (documented at credentials-wall.tsx:143-165). Gating the fetch on
 * status === "authenticated" is what closes that race. This provider is the single
 * source for the page's NEW budget-dependent UI (Z7 "Within reach"); the rehoused
 * QpuSubmitPanel keeps its own fetch (§1 leaves it unchanged), so the page does not
 * add a THIRD independent read.
 */

export type BudgetStatus = "unconfigured" | "loading" | "ready" | "signed-out" | "error";

export interface WorkspaceBudget {
  status: BudgetStatus;
  budget: Budget | null;
}

const Ctx = createContext<WorkspaceBudget>({ status: "unconfigured", budget: null });

export function useWorkspaceBudget(): WorkspaceBudget {
  return useContext(Ctx);
}

export function WorkspaceBudgetProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState<WorkspaceBudget>(() => ({
    status: isQpuConfigured() ? "loading" : "unconfigured",
    budget: null,
  }));

  useEffect(() => {
    // Wait for auth to resolve to authenticated (the progress-sync contract): the
    // bridge must run Amplify.configure before fetchAuthSession works. No synchronous
    // setState here — the initial state already covers unconfigured/loading.
    if (!isQpuConfigured() || authStatus !== "authenticated") return;
    let disposed = false;
    getBudget()
      .then((b) => {
        if (!disposed) setState({ status: "ready", budget: b });
      })
      .catch((e: Error) => {
        // Signed out mid-flight is an honest "signed-out", not an error.
        if (!disposed) setState({ status: e?.name === "NotSignedIn" ? "signed-out" : "error", budget: null });
      });
    return () => {
      disposed = true;
    };
  }, [authStatus]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
