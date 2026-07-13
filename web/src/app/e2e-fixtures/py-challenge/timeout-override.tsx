"use client";

import { useEffect } from "react";
import { __setRunTimeoutMsForTests } from "@/lib/pyodide-runtime";

/**
 * E2E-only knob: `?timeoutMs=NNN` shortens the Python run watchdog so
 * web/e2e/py-grader-timeout.e2e.ts can prove the kill-and-reboot path without
 * waiting out the full production timeout. Renders nothing and is a no-op
 * without the query param (the production default stays in force), so the
 * fixture behaves identically to a lesson page when visited normally. This is
 * the only caller of the test-only setter.
 */
export function TimeoutOverride() {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("timeoutMs");
    const ms = raw === null ? NaN : Number(raw);
    if (Number.isFinite(ms) && ms > 0) __setRunTimeoutMsForTests(ms);
  }, []);
  return null;
}
