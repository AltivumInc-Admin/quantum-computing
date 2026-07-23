import { parseQuiz, quizCardId } from "@/lib/quiz-schema";

describe("quizCardId", () => {
  it("prefixes the author id so it cannot collide with a bare qcard id", () => {
    expect(quizCardId("prereq-born-rule-sentence")).toBe(
      "quiz:prereq-born-rule-sentence",
    );
  });
});

describe("parseQuiz", () => {
  const ok = {
    questions: [
      {
        id: "a",
        q: "Question A?",
        a: "Answer A.",
        hint: "A nudge.",
      },
      { id: "b", q: "Question B?", a: "Answer B." },
    ],
  };

  it("accepts a well-formed multi-question fence", () => {
    const parsed = parseQuiz(JSON.stringify(ok));
    expect(parsed.error).toBeUndefined();
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].id).toBe("a");
    expect(parsed.questions[0].hint).toBe("A nudge.");
    expect(parsed.questions[1].hint).toBeUndefined();
  });

  it("requires a non-empty string id on every question", () => {
    expect(
      parseQuiz(
        JSON.stringify({ questions: [{ id: "  ", q: "q", a: "a" }] }),
      ).error,
    ).toMatch(/non-empty string "id"/);
    expect(
      parseQuiz(JSON.stringify({ questions: [{ q: "q", a: "a" }] })).error,
    ).toMatch(/non-empty string "id"/);
  });

  it("rejects duplicate ids inside one fence", () => {
    expect(
      parseQuiz(
        JSON.stringify({
          questions: [
            { id: "same", q: "one", a: "a" },
            { id: "same", q: "two", a: "b" },
          ],
        }),
      ).error,
    ).toMatch(/duplicate question id "same"/);
  });

  it("returns curated invalid-JSON phrasing, not a raw V8 SyntaxError", () => {
    const parsed = parseQuiz("{ not json");
    expect(parsed.error).toBe("invalid JSON");
  });
});
