"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  cardShell,
  ErrorCard,
  EyebrowLabel,
} from "./widget-ui";

/**
 * Interactive placement quiz rendered from a ```quiz fenced block in a GUIDE.
 * Each question carries an optional thoughtful hint and a worked answer, both
 * revealed on demand so the learner chooses when to see them. Fully static —
 * the answer text ships in the HTML and is toggled client-side.
 *
 * Data shape (JSON inside the fence):
 *   { "questions": [ { "q": "...", "hint": "...", "a": "..." }, ... ] }
 *
 * Field bodies use only inline `code` (no block math), so a tiny inline
 * formatter handles rendering — keeping this component free of the ESM-only
 * markdown pipeline, exactly like CircuitLab.
 */

interface QuizQuestion {
  q: string;
  hint?: string;
  a: string;
}

interface ParsedQuiz {
  questions: QuizQuestion[];
  error?: string;
}

function parseQuiz(source: string): ParsedQuiz {
  try {
    const data = JSON.parse(source) as { questions?: unknown };
    if (!data || !Array.isArray(data.questions)) {
      throw new Error('expected a { "questions": [ ... ] } object');
    }
    if (data.questions.length === 0) {
      throw new Error("quiz needs at least one question");
    }
    data.questions.forEach((item, i) => {
      const q = item as Partial<QuizQuestion>;
      if (typeof q.q !== "string" || typeof q.a !== "string") {
        throw new Error(`question ${i + 1} needs string "q" and "a" fields`);
      }
      // Guard the optional hint so a malformed (non-string truthy) value surfaces
      // as the friendly parse-error card instead of crashing renderInline.
      if (q.hint != null && typeof q.hint !== "string") {
        throw new Error(`question ${i + 1} "hint" must be a string`);
      }
    });
    return { questions: data.questions as QuizQuestion[] };
  } catch (e) {
    return { questions: [], error: (e as Error).message };
  }
}

// Backtick-delimited spans become branded inline-code chips; everything else is
// plain text. Sufficient for the quiz content and keeps this a CommonJS-testable
// client component (no react-markdown import).
function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) => {
    if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-chip bg-accent/10 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-dark dark:text-accent-light"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18h6m-5 3h4m-6.6-7.3A6 6 0 1118 10c0 1.6-.8 3-2 3.9-.6.5-1 1.1-1 1.8v.3H9v-.3c0-.7-.4-1.3-1-1.8a5.9 5.9 0 01-.6-.5z"
      />
    </svg>
  );
}

export function Quiz({ source }: { source: string }) {
  const quiz = useMemo(() => parseQuiz(source), [source]);
  const [openHints, setOpenHints] = useState<ReadonlySet<number>>(new Set());
  const [openAnswers, setOpenAnswers] = useState<ReadonlySet<number>>(new Set());
  const baseId = useId();

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>,
    i: number
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (quiz.error) {
    return <ErrorCard label="quiz parse" message={quiz.error} className="my-8" />;
  }

  const allOpen =
    quiz.questions.length > 0 && openAnswers.size === quiz.questions.length;

  const toggleAll = () =>
    setOpenAnswers(
      allOpen ? new Set() : new Set(quiz.questions.map((_, i) => i))
    );

  return (
    <div className={`not-prose my-8 overflow-hidden ${cardShell}`}>
      <div className="flex items-center justify-between gap-3 border-b border-(--bd) px-4 sm:px-5 py-3">
        <EyebrowLabel strong>
          Placement quiz
        </EyebrowLabel>
        <button
          type="button"
          onClick={toggleAll}
          aria-pressed={allOpen}
          className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium text-caption hover:text-accent-dark dark:hover:text-accent-light hover:bg-accent/5 interactive focus-ring"
        >
          {allOpen ? "Hide all answers" : "Show all answers"}
          <ChevronIcon open={allOpen} />
        </button>
      </div>

      <ol className="list-none m-0 p-0 divide-y divide-(--bd)">
        {quiz.questions.map((item, i) => {
          const hintOpen = openHints.has(i);
          const answerOpen = openAnswers.has(i);
          const hintId = `${baseId}-hint-${i}`;
          const answerId = `${baseId}-answer-${i}`;
          return (
            <li key={i} className="flex gap-3 sm:gap-4 px-4 sm:px-5 py-4">
              <span className="shrink-0 w-9 h-9 rounded-chip bg-accent/10 text-accent-dark dark:text-accent-light font-bold text-sm flex items-center justify-center font-mono tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-[0.95rem] leading-relaxed text-(--ink)">
                  {renderInline(item.q)}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {item.hint && (
                    <button
                      type="button"
                      onClick={() => toggle(setOpenHints, i)}
                      aria-expanded={hintOpen}
                      aria-controls={hintOpen ? hintId : undefined}
                      className="inline-flex items-center gap-1.5 rounded-control border border-warm/40 bg-warm/5 px-2.5 py-1 text-xs font-medium text-warm-dark dark:text-warm-light interactive focus-ring hover:bg-warm/10"
                    >
                      <HintIcon />
                      {hintOpen ? "Hide hint" : "Hint"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(setOpenAnswers, i)}
                    aria-expanded={answerOpen}
                    aria-controls={answerOpen ? answerId : undefined}
                    className="inline-flex items-center gap-1.5 rounded-control border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent-dark dark:text-accent-light interactive focus-ring hover:bg-accent/10"
                  >
                    {answerOpen ? "Hide answer" : "Show answer"}
                    <ChevronIcon open={answerOpen} />
                  </button>
                </div>

                {item.hint && hintOpen && (
                  <div
                    id={hintId}
                    role="region"
                    aria-label={`Hint for question ${i + 1}`}
                    className="mt-3 rounded-control border-l-2 border-warm/60 bg-warm/5 dark:bg-warm/10 px-3.5 py-3 animate-fade-up"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-warm-dark dark:text-warm-light mb-1 font-mono">
                      Hint
                    </span>
                    <p className="text-sm leading-relaxed text-(--mut)">
                      {renderInline(item.hint)}
                    </p>
                  </div>
                )}

                {answerOpen && (
                  <div
                    id={answerId}
                    role="region"
                    aria-label={`Answer to question ${i + 1}`}
                    className="mt-3 rounded-control border-l-2 border-accent/60 bg-accent/5 dark:bg-accent/10 px-3.5 py-3 animate-fade-up"
                  >
                    <EyebrowLabel strong className="block mb-1">
                      Answer
                    </EyebrowLabel>
                    <p className="text-sm leading-relaxed text-(--mut)">
                      {renderInline(item.a)}
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
