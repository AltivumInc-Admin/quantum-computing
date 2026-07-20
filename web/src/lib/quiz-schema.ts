// Parse + validate the JSON inside a ```quiz fenced block.
//
// A quiz is a REVEAL-ANSWER SELF-CHECK, not a graded Rep: no learner input is
// captured, no verdict is computed, and nothing is persisted. It therefore has
// no truth kernel and no scheduler adapter — but it is still a JSON spec that
// degrades to an error card on any mistake, so it belongs in the same
// `@/lib/*-schema` layer the gated kinds use and is validated by the same
// GUIDE-corpus gate (guide-reps.test.ts), rather than only at runtime in the
// learner's browser.

export interface QuizQuestion {
  q: string;
  /** Optional — see README's fence contract. The component branches on absence. */
  hint?: string;
  a: string;
}

export interface ParsedQuiz {
  questions: QuizQuestion[];
  error?: string;
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
    data.questions.forEach((item, i) => {
      // Guard the entry itself first: a `null` array element would otherwise
      // make the field reads below throw a raw TypeError, which the catch would
      // forward to the learner in place of the friendly message.
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`question ${i + 1} must be an object`);
      }
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
