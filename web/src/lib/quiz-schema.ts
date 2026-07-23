// Parse + validate the JSON inside a ```quiz fenced block.
//
// A quiz is a multi-question REVEAL-THEN-RATE self-check: the learner reveals
// the worked answer, then self-rates (Again / Hard / Good / Easy) exactly like
// a ```qcard. Each rated question becomes an FSRS card under `qc:card:quiz:<id>`
// and resurfaces on /review as a text recall card. There is no auto-grader and
// no truth kernel — honesty is the learner's, same as qcard.
//
// It still degrades to an error card on any mistake, so it belongs in the same
// `@/lib/*-schema` layer the gated kinds use and is validated by the same
// GUIDE-corpus gate (guide-reps.test.ts), rather than only at runtime in the
// learner's browser.
//
// IMPORTANT: never rename or reuse a question `id` — it is the localStorage
// key (via quizCardId), so a changed id silently orphans a learner's progress.

export interface QuizQuestion {
  /**
   * Stable author id. Scoped under the `quiz:` card-key prefix so it cannot
   * collide with a bare ```qcard id or a graded-Rep `kind:id` key.
   */
  id: string;
  q: string;
  /** Optional — see README's fence contract. The component branches on absence. */
  hint?: string;
  a: string;
}

export interface ParsedQuiz {
  questions: QuizQuestion[];
  error?: string;
}

/**
 * Review-card storage id for a quiz question: `quiz:<id>`. Mirrors
 * `cardIdFor(kind, id)` for graded Reps, but quiz is not a live-widget CardKind
 * (it always falls back to the text recall card on /review), so the prefix
 * lives here rather than on that union.
 */
export function quizCardId(questionId: string): string {
  return `quiz:${questionId}`;
}

export function parseQuiz(source: string): ParsedQuiz {
  try {
    let data: { questions?: unknown };
    try {
      data = JSON.parse(source) as { questions?: unknown };
    } catch {
      // The curated phrasing parse-utils' parseJsonObject returns, rather than
      // the raw V8 SyntaxError ("Expected property name or '}' in JSON at
      // position 2") this used to forward verbatim into the learner-facing
      // error card. Not imported from parse-utils because that module pulls in
      // the math kernel, which would put it back into the quiz's own chunk —
      // the exact weight the ./error-card lean-import path removes.
      throw new Error("invalid JSON");
    }
    if (!data || !Array.isArray(data.questions)) {
      throw new Error('expected a { "questions": [ ... ] } object');
    }
    if (data.questions.length === 0) {
      throw new Error("quiz needs at least one question");
    }
    const seen = new Set<string>();
    data.questions.forEach((item, i) => {
      // Guard the entry itself first: a `null` array element would otherwise
      // make the field reads below throw a raw TypeError, which the catch would
      // forward to the learner in place of the friendly message.
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`question ${i + 1} must be an object`);
      }
      const q = item as Partial<QuizQuestion>;
      if (typeof q.id !== "string" || !q.id.trim()) {
        throw new Error(`question ${i + 1} needs a non-empty string "id"`);
      }
      if (seen.has(q.id)) {
        throw new Error(`duplicate question id "${q.id}"`);
      }
      seen.add(q.id);
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
