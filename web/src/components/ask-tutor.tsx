"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { MAX_QUESTION_CHARS, OUT_OF_SCOPE_MESSAGE, TUTOR_ERROR_SENTINEL } from "@/lib/tutor";
import { sha256Hex } from "@/lib/sha256";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { DRAWER_INERT_REGION_IDS, TUTOR_TRIGGER_ID } from "@/lib/layout-regions";
import { getSectionBySlug } from "@/lib/sections";

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

// Idle watchdog, RE-ARMED on every chunk. A total-duration cap armed once before
// the fetch cannot tell a stalled connection from a long healthy answer: a stream
// that dies two seconds in would pin the UI on "Asking…" for the rest of the
// budget. Measuring silence instead surfaces a stall in seconds, and a slow but
// live answer never trips it. The Lambda's own delta deadline is 45s.
const STREAM_IDLE_TIMEOUT_MS = 30_000;

// Everything the open panel marks inert, reusing the drawer's shared list (the
// ids are owned by their elements in lib/layout-regions.ts) so aria-modal="true"
// is truthful: without it the claim HIDES a background that is still scrollable,
// clickable and text-selectable. The tutor's own trigger is excluded — close()
// hands focus back to it, and an inert element cannot take focus.
const TUTOR_INERT_REGION_IDS = DRAWER_INERT_REGION_IDS.filter((id) => id !== TUTOR_TRIGGER_ID);

const MAC_SHORTCUT = "⌘K";

/**
 * The chord label for THIS platform. The handler accepts metaKey OR ctrlKey, so
 * Ctrl-K genuinely works off macOS and hardcoding ⌘K there advertised something
 * untrue about the machine the page is running on.
 *
 * Read through useSyncExternalStore below rather than during render: the value
 * differs between the prerendered static export and the browser, and that store
 * is React's sanctioned way to serve one snapshot to hydration and the other
 * immediately after — no mismatch, and no setState in an effect.
 */
function platformShortcut(): string {
  if (typeof navigator === "undefined") return MAC_SHORTCUT;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? MAC_SHORTCUT : "Ctrl K";
}

/** The platform cannot change during a session, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};
const serverShortcut = () => MAC_SHORTCUT;

/**
 * Learner-facing copy for a non-ok response. The raw `request failed (403)` this
 * replaced was the user-visible outcome of the whole edge-protection layer: a
 * status code with no explanation and no retry guidance.
 *
 * 403 and 429 deliberately share one sentence. The WAF rate limit is the only
 * realistic cause of either: edge.yaml now returns 429, but a distribution
 * deployed before that change still blocks with WAF's default 403, so the two
 * must read identically for the copy to be true in both states.
 */
function transportErrorMessage(status: number): string {
  if (status === 403 || status === 429) {
    return "Too many questions in a short window — give it a minute and try again.";
  }
  if (status >= 500) return "The tutor is unavailable right now — please try again shortly.";
  return "The tutor could not answer that request — please try again.";
}

function lessonSlug(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/learn\/([^/]+)/.exec(pathname);
  return m ? m[1] : null;
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
  // Discrete state transitions for screen readers — see the status node below.
  const [srStatus, setSrStatus] = useState("");
  const shortcut = useSyncExternalStore(subscribeNever, platformShortcut, serverShortcut);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors `open` for the Cmd-K handler, which needs the current value but must
  // not branch inside a setState updater (React treats updaters as pure and
  // double-invokes them under StrictMode).
  const openRef = useRef(false);
  const trapFocus = useFocusTrap(dialogRef);

  // Close the panel: abort any in-flight stream and restore focus to the trigger
  // (the dialog claims aria-modal, so it must hand focus back on close). The ONE
  // definition of closing — every path (button, Escape, scrim, Cmd-K) calls it.
  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Cmd/Ctrl-K toggles the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) close();
        else setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    openRef.current = open;
    if (open) inputRef.current?.focus();
  }, [open]);

  // The modal contract, matching sidebar.tsx and section-gate-modal.tsx: mark the
  // background inert, lock body scroll, and handle Escape + Tab on DOCUMENT. The
  // listener cannot live on the dialog div: clicking Ask disables the submit
  // button under the pointer, browsers blur a control that becomes disabled, and
  // focus lands on <body> — which is an ANCESTOR of the dialog, so a React
  // onKeyDown prop would never see the event and Escape/Tab would silently die
  // for the whole streaming window. (The submit now uses aria-disabled for the
  // same reason, so it also keeps its place in the trap's focusable list.)
  useEffect(() => {
    if (!open) return;
    const regions = TUTOR_INERT_REGION_IDS.map((id) => document.getElementById(id));
    for (const region of regions) region?.setAttribute("inert", "");

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      trapFocus(e);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      for (const region of regions) region?.removeAttribute("inert");
      document.body.style.overflow = prevOverflow;
    };
    // trapFocus is a stable useCallback (keyed on the ref) and close has no deps,
    // so neither re-triggers this open/close effect.
  }, [open, close, trapFocus]);

  // Abort an in-flight stream when the lesson changes OR the panel is torn down.
  // Keying the cleanup on `slug` is what makes the abort-on-navigation promise
  // real: this component is mounted in the ROOT layout, so an effect with an
  // empty dep array only ever fires when the layout itself unmounts — never on a
  // route change, despite the comment that used to claim otherwise.
  useEffect(() => () => abortRef.current?.abort(), [slug]);

  // Reset the transcript when the lesson changes, adjusting state during render
  // (React's documented pattern for derived resets) so the stale answer is never
  // painted under the new lesson's name. `slug` and the "Grounded in" line
  // re-label instantly on navigation while answer/question/error did not, leaving
  // the previous lesson's text under the new lesson's title — a false provenance
  // claim, which is the one thing the grounding architecture exists to prevent.
  const [groundedSlug, setGroundedSlug] = useState(slug);
  if (slug !== groundedSlug) {
    setGroundedSlug(slug);
    setAnswer("");
    setError(null);
    setQuestion("");
    setSrStatus("");
  }

  // Hooks above always run; the feature is inert without an endpoint or lesson.
  if (!url || !slug) return null;

  const lessonTitle = getSectionBySlug(slug)?.title ?? slug;
  // The refusal is not an answer — render it in the muted caption register so it
  // does not read as grounded lesson prose in the learner's own words.
  const refused = answer.trim() === OUT_OF_SCOPE_MESSAGE;
  const submitBlocked = busy || !question.trim();

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, STREAM_IDLE_TIMEOUT_MS);
    };
    armWatchdog();

    setBusy(true);
    setError(null);
    setAnswer("");
    setSrStatus("Thinking");
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
      if (!res.ok || !res.body) {
        // The numeric status stays in the console for debugging; the learner gets
        // copy that says what happened and what to do about it.
        console.warn(`tutor request failed (${res.status})`);
        throw new Error(transportErrorMessage(res.status));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        armWatchdog();
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
          setSrStatus("");
          await reader.cancel();
          return;
        }
        setAnswer(acc);
      }
      if (!acc.trim()) {
        // A clean finish and a stream cut short are byte-identical on the wire
        // (there is no terminal marker), so an EMPTY body is the only early end
        // the client can detect — and it is unambiguous: the endpoint always
        // writes either an answer, the refusal, or the sentinel. Report it as the
        // failure it is instead of rendering an empty, authoritative answer.
        setError("The tutor did not send an answer — please try again.");
        setSrStatus("");
        return;
      }
      setSrStatus("Answer ready");
    } catch (e) {
      if (controller.signal.aborted) {
        // Aborted by the watchdog → tell the learner; aborted by Close/navigation
        // → the panel is gone or reset, so stay silent.
        if (timedOut) setError("The tutor stopped responding — please try again.");
      } else if (e instanceof TypeError) {
        // fetch rejects with a TypeError for DNS/offline/CORS — its raw message
        // ("Failed to fetch") is a developer string, not an explanation.
        setError("Could not reach the tutor — check your connection.");
      } else {
        setError((e as Error).message);
      }
      setSrStatus("");
    } finally {
      if (timer) clearTimeout(timer);
      setBusy(false);
      abortRef.current = null;
    }
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
        {/* The chord is only pressable where a keyboard is: below lg the pill is
            deliberately repositioned for touch, where advertising a shortcut is
            noise that costs width. */}
        <kbd className="hidden lg:inline-flex rounded bg-(--field) border border-(--bd) px-1.5 py-0.5 font-mono text-[10px] text-caption">
          {shortcut}
        </kbd>
      </button>

      {open && (
        <>
          {/* Scrim — the pointer half of the aria-modal claim (the inert marking
              above is the AT half), and the dismissal affordance the panel used
              to lack entirely on touch, where the close button was the only way
              out. Matches section-gate-modal's treatment. */}
          <div
            className="animate-backdrop-fade fixed inset-0 z-50 bg-smoke/70 backdrop-blur-sm"
            aria-hidden="true"
            onMouseDown={close}
          />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Lesson tutor"
            tabIndex={-1}
            // Height prefers the dynamic viewport so the composer at the bottom
            // clears iOS Safari's toolbar, with h-screen as the natural fallback
            // — the same progressive-enhancement pair the sidebar drawer uses.
            // `inset-y-0` resolved against the LARGE viewport, hiding the
            // textarea and the Ask button (the whole feature on mobile) behind
            // the toolbar until the learner scrolled the page to retract it.
            className="fixed top-0 right-0 h-screen supports-[height:100dvh]:h-dvh z-[60] flex w-full max-w-md flex-col border-l border-(--bd) bg-(--glass) shadow-2xl backdrop-blur-xl animate-slide-in outline-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-(--bd) px-5 py-4">
              <div className="min-w-0">
                <p className="font-display text-lg text-(--ink)">Ask the margin</p>
                {/* The CANONICAL section title from the content manifest — the
                    byte-identical string the Lambda puts in the system prompt as
                    'The lesson is titled "…"'. A slug-derived label was a third,
                    hand-rolled derivation that matched neither the prompt nor the
                    page heading ("Quantum Ml", "Prereqs"). Real titles run long,
                    so the line clamps rather than pushing the header open. */}
                <p className="mt-0.5 line-clamp-2 text-xs text-caption">
                  Grounded in:{" "}
                  <span className="text-accent-dark dark:text-accent-light">{lessonTitle}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label="Close tutor"
                onClick={close}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control p-1.5 text-caption hover:text-(--mut) interactive focus-ring"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Deliberately NOT a live region. aria-live + aria-busy on the
                  streaming answer prescribed opposite behaviours: AT that honours
                  aria-busy defers the whole stream (total silence, including the
                  "Thinking…" cue) and flushes once at the end, while AT that
                  ignores it re-announces the ENTIRE accumulated answer on every
                  chunk, because setAnswer replaces this <p>'s only text node.
                  Long streamed prose is read with the virtual cursor; the sr-only
                  status node below carries the two state transitions instead.

                  Plain-text sink by design: buildSystemPrompt forbids Markdown
                  and LaTeX in the reply, so the model returns plain prose. Adding
                  a Markdown renderer here without relaxing that rule would render
                  nothing it does not already render correctly. */}
              {answer ? (
                <p
                  className={`whitespace-pre-wrap text-[0.95rem] leading-relaxed ${
                    refused ? "text-caption" : "text-(--ink)"
                  }`}
                >
                  {answer}
                </p>
              ) : (
                <p className="text-sm text-caption">
                  {busy
                    ? "Thinking…"
                    : "Ask anything about this lesson. I answer only from the lesson text and will nudge you with a question before handing over the full answer."}
                </p>
              )}
              {/* Two announcements per question — "Thinking", then "Answer ready"
                  — instead of either silence or dozens of full-answer repeats. */}
              <p role="status" className="sr-only">
                {srStatus}
              </p>
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
                // The SAME cap the handler enforces (single-sourced from
                // tutor-core.mjs). Without it the server silently sliced a long
                // paste mid-word and answered the fragment as though it were the
                // whole question; the browser now stops the input at the keyboard.
                maxLength={MAX_QUESTION_CHARS}
                placeholder="e.g. why does the Z-string only act on the lower modes?"
                className="w-full resize-y rounded-control border border-(--bd) bg-(--field) px-3 py-2.5 text-sm text-(--ink) focus-ring"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                {/* A rows={3}, resize-y textarea reads as multi-line, but bare
                    Enter submits — so the escape hatch has to be stated. */}
                <p className="text-xs text-caption">Enter to send, Shift+Enter for a new line</p>
                <button
                  type="submit"
                  // aria-disabled, not disabled: a hard `disabled` flipping on
                  // submit blurs the button under the pointer, evicting focus to
                  // <body> and dropping it out of the focus trap's list for the
                  // whole request. ask() already returns early when blocked.
                  aria-disabled={submitBlocked}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-control surface-accent px-3.5 py-1.5 text-sm font-medium interactive focus-ring aria-disabled:opacity-60"
                >
                  {busy ? "Asking…" : "Ask"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
