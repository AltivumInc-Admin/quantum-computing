"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TUTOR_ERROR_SENTINEL } from "@/lib/tutor";
import { sha256Hex } from "@/lib/sha256";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { TUTOR_TRIGGER_ID } from "@/lib/layout-regions";

/**
 * "Ask the margin" — a Socratic lesson tutor. A fixed affordance (and Cmd/Ctrl-K)
 * opens a slide-over that streams a Claude answer grounded in the CURRENT lesson.
 * The endpoint is a single streaming Lambda Function URL (see lambda/tutor/);
 * the client only sends { slug, question } and renders the streamed tokens.
 *
 * It renders nothing unless (a) NEXT_PUBLIC_TUTOR_URL is configured and (b) the
 * learner is inside a /learn/<slug> lesson — so the static export and the home /
 * review pages are unaffected when the endpoint is absent.
 */

// The Lambda Timeout is 60s; the client watchdog sits just beyond it so a truly
// stalled connection (no bytes, no close) can't pin the UI on "Asking…" forever.
const STREAM_TIMEOUT_MS = 65_000;

function lessonSlug(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/learn\/([^/]+)/.exec(pathname);
  return m ? m[1] : null;
}

function lessonLabel(slug: string): string {
  return slug
    .replace(/^\d+-/, "")
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function AskTutor() {
  const url = process.env.NEXT_PUBLIC_TUTOR_URL;
  const pathname = usePathname();
  const slug = lessonSlug(pathname);

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const trapFocus = useFocusTrap(dialogRef);

  // Close the panel: abort any in-flight stream and restore focus to the trigger
  // (the dialog claims aria-modal, so it must hand focus back on close).
  const close = () => {
    abortRef.current?.abort();
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Cmd/Ctrl-K toggles the panel. Escape + Tab are handled on the dialog itself
  // (below) so the modal keeps focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) {
            abortRef.current?.abort();
            triggerRef.current?.focus();
          }
          return !wasOpen;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Abort any in-flight stream if the component unmounts (route change).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Hooks above always run; the feature is inert without an endpoint or lesson.
  if (!url || !slug) return null;

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STREAM_TIMEOUT_MS);

    setBusy(true);
    setError(null);
    setAnswer("");
    try {
      const bodyStr = JSON.stringify({ slug, question: q });
      // CloudFront Origin Access Control requires the SHA-256 of the POST body in
      // x-amz-content-sha256 (Lambda doesn't accept unsigned payloads through OAC).
      // Guard for crypto.subtle, absent in non-secure/test contexts; the deployed
      // HTTPS site always has it. When absent we omit the header rather than throw.
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (typeof crypto !== "undefined" && crypto.subtle) {
        headers["x-amz-content-sha256"] = await sha256Hex(bodyStr);
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const marker = acc.indexOf(TUTOR_ERROR_SENTINEL);
        if (marker !== -1) {
          // The endpoint signalled a failure in-band — it had already committed
          // a 200 status, so it can't fail the response. Show whatever streamed
          // before the marker as the answer and surface the rest as an error,
          // rather than letting the apology read like part of the answer.
          setAnswer(acc.slice(0, marker).trimEnd());
          setError(
            acc.slice(marker + TUTOR_ERROR_SENTINEL.length).trim() ||
              "The tutor hit an error. Please try again."
          );
          await reader.cancel();
          return;
        }
        setAnswer(acc);
      }
    } catch (e) {
      if (controller.signal.aborted) {
        // Aborted by the watchdog → tell the learner; aborted by Close/unmount →
        // the panel is gone, so stay silent.
        if (timedOut) setError("That took too long — please try again.");
      } else {
        setError((e as Error).message);
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
      abortRef.current = null;
    }
  };

  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    trapFocus(e);
  };

  return (
    <>
      <button
        ref={triggerRef}
        // Shared-constant id: the mobile drawer marks this pill inert while it
        // is open (see lib/layout-regions.ts and sidebar.tsx).
        id={TUTOR_TRIGGER_ID}
        type="button"
        aria-label="Ask about this lesson"
        onClick={() => setOpen(true)}
        // Below lg the sidebar's mobile drawer toggle owns the bottom-right
        // corner (fixed bottom-4 right-4, ~48px); the pill sits one slot above
        // it (bottom-20 clears the toggle plus a 16px gap) so the two fixed
        // affordances never stack. Desktop keeps the original placement.
        className="fixed bottom-20 right-4 lg:bottom-5 lg:right-5 z-50 inline-flex items-center gap-2 rounded-full glass px-4 py-2.5 text-sm font-medium text-(--mut) interactive focus-ring hover:text-accent dark:hover:text-accent-light"
      >
        Ask
        <kbd className="rounded bg-(--field) border border-(--bd) px-1.5 py-0.5 font-mono text-[10px] text-caption">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Lesson tutor"
          onKeyDown={onDialogKeyDown}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-(--bd) bg-(--glass) shadow-2xl backdrop-blur-xl animate-slide-in"
        >
          <div className="flex items-start justify-between gap-3 border-b border-(--bd) px-5 py-4">
            <div>
              <p className="font-display text-lg text-(--ink)">Ask the margin</p>
              <p className="mt-0.5 text-xs text-caption">
                Grounded in: <span className="text-accent dark:text-accent-light">{lessonLabel(slug)}</span>
              </p>
            </div>
            <button
              type="button"
              aria-label="Close tutor"
              onClick={close}
              className="rounded-control p-1.5 text-caption hover:text-(--mut) interactive focus-ring"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Stable live region (always mounted) so streamed tokens are announced
                incrementally to screen readers as they arrive. */}
            <div aria-live="polite" aria-atomic="false" aria-busy={busy}>
              {answer ? (
                <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-(--ink)">
                  {answer}
                </p>
              ) : (
                <p className="text-sm text-caption">
                  {busy
                    ? "Thinking…"
                    : "Ask anything about this lesson. I answer only from the lesson text and will nudge you with a question before handing over the full answer."}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-warm-dark dark:text-warm-light">
                {error}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
            className="border-t border-(--bd) px-5 py-4"
          >
            <label htmlFor="ask-tutor-input" className="sr-only">
              Your question
            </label>
            <textarea
              id="ask-tutor-input"
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
              rows={3}
              placeholder="e.g. why does the Z-string only act on the lower modes?"
              className="w-full resize-y rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 text-sm text-(--ink) focus-ring"
            />
            <div className="mt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={busy || !question.trim()}
                className="inline-flex items-center gap-1.5 rounded-control surface-accent px-3.5 py-1.5 text-sm font-medium interactive focus-ring disabled:opacity-60"
              >
                {busy ? "Asking…" : "Ask"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
