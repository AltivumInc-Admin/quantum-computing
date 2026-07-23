/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Quiz } from "@/components/quantum/quiz";
import { quizCardId } from "@/lib/quiz-schema";

const source = JSON.stringify({
  questions: [
    {
      id: "test-matmul",
      q: "In NumPy, what is the difference between `M @ v` and `M * v`?",
      hint: "Think about shapes.",
      a: "`@` is matrix multiplication; `*` is elementwise multiplication.",
    },
    {
      id: "test-conj",
      q: "Write the conjugate transpose of `M`.",
      hint: "Two operations chained together.",
      a: "`M.conj().T`.",
    },
  ],
});

describe("Quiz", () => {
  beforeEach(() => localStorage.clear());

  it("renders every question with a zero-padded number", () => {
    render(<Quiz source={source} />);
    expect(screen.getByText(/what is the difference between/i)).toBeInTheDocument();
    expect(screen.getByText(/Write the conjugate transpose/i)).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("hides answers by default", () => {
    render(<Quiz source={source} />);
    expect(screen.queryByText(/elementwise multiplication/i)).not.toBeInTheDocument();
    const answerButtons = screen.getAllByRole("button", { name: /show answer/i });
    expect(answerButtons).toHaveLength(2);
    answerButtons.forEach((b) => expect(b).toHaveAttribute("aria-expanded", "false"));
  });

  it("reveals a single answer when its toggle is clicked", () => {
    render(<Quiz source={source} />);
    const firstAnswer = screen.getAllByRole("button", { name: /show answer/i })[0];
    fireEvent.click(firstAnswer);

    expect(screen.getByText(/is matrix multiplication/i)).toBeInTheDocument();
    expect(firstAnswer).toHaveAttribute("aria-expanded", "true");
    expect(firstAnswer).toHaveTextContent(/hide answer/i);
    // The second question's answer stays hidden.
    expect(screen.queryByText(/^M\.conj\(\)\.T$/)).not.toBeInTheDocument();
  });

  it("reveals a thoughtful hint independently of the answer", () => {
    render(<Quiz source={source} />);
    expect(screen.queryByText("Think about shapes.")).not.toBeInTheDocument();
    const firstHint = screen.getAllByRole("button", { name: /^hint$/i })[0];
    fireEvent.click(firstHint);

    expect(screen.getByText("Think about shapes.")).toBeInTheDocument();
    expect(firstHint).toHaveAttribute("aria-expanded", "true");
    // Revealing a hint does not reveal the answer.
    expect(screen.queryByText(/elementwise multiplication/i)).not.toBeInTheDocument();
  });

  it("toggles every answer with the global control", () => {
    render(<Quiz source={source} />);
    const showAll = screen.getByRole("button", { name: /show all answers/i });
    fireEvent.click(showAll);

    expect(screen.getByText(/is matrix multiplication/i)).toBeInTheDocument();
    expect(screen.getByText(/^M\.conj\(\)\.T$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /hide all answers/i })
    ).toBeInTheDocument();
  });

  it("links each toggle to its revealed region only while expanded", () => {
    render(<Quiz source={source} />);
    const firstAnswer = screen.getAllByRole("button", { name: /show answer/i })[0];
    // Collapsed by default: no dangling IDREF to a region that is not mounted.
    expect(firstAnswer).not.toHaveAttribute("aria-controls");
    fireEvent.click(firstAnswer);
    const region = screen.getByRole("group", { name: /answer to question 1/i });
    expect(firstAnswer).toHaveAttribute("aria-controls", region.getAttribute("id"));
  });

  it("renders inline code as a <code> chip", () => {
    render(<Quiz source={source} />);
    fireEvent.click(screen.getAllByRole("button", { name: /show answer/i })[0]);
    const chip = screen.getByText("@", { selector: "code" });
    expect(chip.tagName).toBe("CODE");
  });

  it("labels itself section-neutrally (the same fence is a check, not only a placement test)", () => {
    render(<Quiz source={source} />);
    expect(screen.getByText("Self-check")).toBeInTheDocument();
    expect(screen.queryByText(/placement quiz/i)).not.toBeInTheDocument();
  });

  it("does not pair aria-pressed with a label that already flips", () => {
    render(<Quiz source={source} />);
    const showAll = screen.getByRole("button", { name: /show all answers/i });
    // "Hide all answers, pressed" would announce a state opposite to the label.
    expect(showAll).not.toHaveAttribute("aria-pressed");
    fireEvent.click(showAll);
    expect(
      screen.getByRole("button", { name: /hide all answers/i })
    ).not.toHaveAttribute("aria-pressed");
  });

  it("does not add a landmark per revealed panel", () => {
    render(<Quiz source={source} />);
    fireEvent.click(screen.getByRole("button", { name: /show all answers/i }));
    screen.getAllByRole("button", { name: /^hint$/i }).forEach((b) => fireEvent.click(b));
    // A named role="region" IS a landmark: two questions would put four of them
    // in the rotor, and the 10-question 00-prereqs quiz twenty.
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.getAllByRole("group")).toHaveLength(4);
  });

  it("omits the Hint control for a question with no hint (the documented-optional branch)", () => {
    render(
      <Quiz
        source={JSON.stringify({
          questions: [{ id: "hintless", q: "A hintless question.", a: "Its answer." }],
        })}
      />
    );
    expect(screen.queryByRole("button", { name: /^hint$/i })).not.toBeInTheDocument();
    const answer = screen.getByRole("button", { name: /show answer/i });
    fireEvent.click(answer);
    expect(screen.getByText("Its answer.")).toBeInTheDocument();
  });

  it("degrades gracefully on malformed quiz data, without leaking engine text", () => {
    render(<Quiz source={"{ not valid json"} />);
    expect(screen.getByText(/quiz parse error/i)).toBeInTheDocument();
    // The curated phrasing its twelve JSON-config siblings use, not a raw V8
    // SyntaxError ("Expected property name or '}' in JSON at position 2").
    expect(screen.getByText(/invalid JSON/i)).toBeInTheDocument();
    expect(screen.queryByText(/at position/i)).not.toBeInTheDocument();
  });

  it("reports a friendly message for a null entry instead of a raw TypeError", () => {
    render(<Quiz source={JSON.stringify({ questions: [null] })} />);
    expect(screen.getByText(/question 1 must be an object/i)).toBeInTheDocument();
    expect(screen.queryByText(/cannot read propert/i)).not.toBeInTheDocument();
  });

  it("shows a parse error for a non-string hint instead of crashing the render", () => {
    render(
      <Quiz
        source={JSON.stringify({
          questions: [{ id: "x", q: "x", a: "y", hint: 5 }],
        })}
      />
    );
    expect(screen.getByText(/quiz parse error/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show all answers/i })).not.toBeInTheDocument();
  });

  it("requires a non-empty id on every question", () => {
    render(
      <Quiz
        source={JSON.stringify({
          questions: [{ id: "", q: "q", a: "a" }],
        })}
      />
    );
    expect(screen.getByText(/non-empty string "id"/i)).toBeInTheDocument();
  });

  it("rejects duplicate ids within one fence", () => {
    render(
      <Quiz
        source={JSON.stringify({
          questions: [
            { id: "dup", q: "one", a: "a" },
            { id: "dup", q: "two", a: "b" },
          ],
        })}
      />
    );
    expect(screen.getByText(/duplicate question id "dup"/i)).toBeInTheDocument();
  });

  it("treats an empty question set as malformed rather than rendering empty chrome", () => {
    render(<Quiz source={JSON.stringify({ questions: [] })} />);
    expect(screen.getByText(/quiz parse error/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show all answers/i })
    ).not.toBeInTheDocument();
  });

  it("shows self-rate buttons after an answer is revealed", () => {
    render(<Quiz source={source} />);
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /show answer/i })[0]);
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/how well did you recall it/i)).toBeInTheDocument();
  });

  it("schedules an FSRS card under the quiz: prefix and reports the next review", () => {
    render(<Quiz source={source} />);
    fireEvent.click(screen.getAllByRole("button", { name: /show answer/i })[0]);
    fireEvent.click(screen.getByText("Good"));
    expect(screen.getByText(/next review/i)).toBeInTheDocument();
    const key = `qc:card:${quizCardId("test-matmul")}`;
    expect(localStorage.getItem(key)).not.toBeNull();
    const state = JSON.parse(localStorage.getItem(key)!);
    expect(state.reps).toBe(1);
  });

  it("re-grading a question that is no longer due is a no-op (interval-inflation guard)", () => {
    render(<Quiz source={source} />);
    fireEvent.click(screen.getAllByRole("button", { name: /show answer/i })[0]);
    fireEvent.click(screen.getByText("Good"));
    const key = `qc:card:${quizCardId("test-matmul")}`;
    const first = JSON.parse(localStorage.getItem(key)!);
    expect(first.reps).toBe(1);

    fireEvent.click(screen.getByText("Good"));
    const second = JSON.parse(localStorage.getItem(key)!);
    expect(second.reps).toBe(1);
    expect(second.dueEpochDay).toBe(first.dueEpochDay);
    expect(screen.getByText(/schedule unchanged/i)).toBeInTheDocument();
  });

  it("caches prompt + answer for every question so /review can re-mount from the schedule", () => {
    render(<Quiz source={source} />);
    const cached1 = JSON.parse(
      localStorage.getItem(`qc:card-content:${quizCardId("test-matmul")}`)!,
    );
    expect(cached1).toEqual({
      prompt: "In NumPy, what is the difference between `M @ v` and `M * v`?",
      answer: "`@` is matrix multiplication; `*` is elementwise multiplication.",
    });
    // No kind/source — dashboard falls back to the text recall card.
    expect(cached1.kind).toBeUndefined();
    expect(cached1.source).toBeUndefined();

    const cached2 = JSON.parse(
      localStorage.getItem(`qc:card-content:${quizCardId("test-conj")}`)!,
    );
    expect(cached2.prompt).toMatch(/conjugate transpose/i);
  });

  it("rates questions independently (grading one does not schedule the other)", () => {
    render(<Quiz source={source} />);
    fireEvent.click(screen.getByRole("button", { name: /show all answers/i }));
    // Two Good buttons — grade only the first question's strip. Order follows
    // document order: question 1's four ratings, then question 2's.
    const goods = screen.getAllByText("Good");
    fireEvent.click(goods[0]);
    expect(localStorage.getItem(`qc:card:${quizCardId("test-matmul")}`)).not.toBeNull();
    expect(localStorage.getItem(`qc:card:${quizCardId("test-conj")}`)).toBeNull();
  });
});
