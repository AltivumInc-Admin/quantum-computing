/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { Quiz } from "@/components/quantum/quiz";

const source = JSON.stringify({
  questions: [
    {
      q: "In NumPy, what is the difference between `M @ v` and `M * v`?",
      hint: "Think about shapes.",
      a: "`@` is matrix multiplication; `*` is elementwise multiplication.",
    },
    {
      q: "Write the conjugate transpose of `M`.",
      hint: "Two operations chained together.",
      a: "`M.conj().T`.",
    },
  ],
});

describe("Quiz", () => {
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
    const region = screen.getByRole("region", { name: /answer to question 1/i });
    expect(firstAnswer).toHaveAttribute("aria-controls", region.getAttribute("id"));
  });

  it("renders inline code as a <code> chip", () => {
    render(<Quiz source={source} />);
    fireEvent.click(screen.getAllByRole("button", { name: /show answer/i })[0]);
    const chip = screen.getByText("@", { selector: "code" });
    expect(chip.tagName).toBe("CODE");
  });

  it("degrades gracefully on malformed quiz data", () => {
    render(<Quiz source={"{ not valid json"} />);
    expect(screen.getByText(/quiz parse error/i)).toBeInTheDocument();
  });

  it("treats an empty question set as malformed rather than rendering empty chrome", () => {
    render(<Quiz source={JSON.stringify({ questions: [] })} />);
    expect(screen.getByText(/quiz parse error/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show all answers/i })
    ).not.toBeInTheDocument();
  });
});
