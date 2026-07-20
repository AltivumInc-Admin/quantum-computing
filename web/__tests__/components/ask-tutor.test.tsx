/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadableStream } from "node:stream/web";
import { TextEncoder, TextDecoder } from "node:util";

// jsdom does not expose the streaming/encoding globals the tutor uses at runtime.
const g = globalThis as Record<string, unknown>;
g.ReadableStream ??= ReadableStream;
g.TextEncoder ??= TextEncoder;
g.TextDecoder ??= TextDecoder;

import { AskTutor } from "@/components/ask-tutor";
import { MAX_QUESTION_CHARS, OUT_OF_SCOPE_MESSAGE, TUTOR_ERROR_SENTINEL } from "@/lib/tutor";
import { SITE_HEADER_ID, TUTOR_TRIGGER_ID } from "@/lib/layout-regions";

let mockPathname = "/learn/03-algorithms";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

function streamResponse(chunks: string[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function failedResponse(status: number) {
  return { ok: false, status, body: null } as unknown as Response;
}

/** Open the panel, type a question, and submit it with Enter. */
function askQuestion(text = "why is it faster?") {
  fireEvent.click(screen.getByLabelText("Ask about this lesson"));
  const input = screen.getByLabelText("Your question");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

const URL = "https://tutor.example/";

describe("AskTutor", () => {
  beforeEach(() => {
    mockPathname = "/learn/03-algorithms";
    process.env.NEXT_PUBLIC_TUTOR_URL = URL;
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TUTOR_URL;
    // @ts-expect-error - jsdom has no fetch; remove the per-test mock
    delete global.fetch;
    jest.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("renders nothing when the endpoint is not configured", () => {
    delete process.env.NEXT_PUBLIC_TUTOR_URL;
    render(<AskTutor />);
    expect(screen.queryByLabelText("Ask about this lesson")).toBeNull();
  });

  it("renders nothing outside a lesson", () => {
    mockPathname = "/";
    render(<AskTutor />);
    expect(screen.queryByLabelText("Ask about this lesson")).toBeNull();
  });

  it("offsets the pill above the mobile drawer toggle below lg, original slot on desktop", () => {
    // The sidebar's drawer toggle owns bottom-4 right-4 on <lg viewports; the
    // pill must sit clear of it (bottom-20) or it swallows taps meant for the
    // only mobile navigation affordance on lesson pages.
    render(<AskTutor />);
    const trigger = screen.getByLabelText("Ask about this lesson");
    expect(trigger.className).toContain("bottom-20");
    expect(trigger.className).toContain("right-4");
    expect(trigger.className).toContain("lg:bottom-5");
    expect(trigger.className).toContain("lg:right-5");
  });

  it("hides the chord chip below lg, where no keyboard can press it", () => {
    render(<AskTutor />);
    const kbd = screen.getByLabelText("Ask about this lesson").querySelector("kbd");
    expect(kbd?.className).toContain("hidden");
    expect(kbd?.className).toContain("lg:inline-flex");
  });

  it("advertises the chord for THIS platform, not a hardcoded mac glyph", () => {
    // jsdom reports a non-mac platform, and the handler accepts ctrlKey too, so
    // the label must resolve rather than always claiming Command.
    render(<AskTutor />);
    const kbd = screen.getByLabelText("Ask about this lesson").querySelector("kbd");
    expect(kbd?.textContent).toBe("Ctrl K");
  });

  it("names the lesson with the canonical manifest title the Lambda is grounded in", () => {
    // The slug-derived label was a third derivation matching neither the system
    // prompt nor the page heading ("Quantum Ml", "Prereqs", "Algorithms").
    render(<AskTutor />);
    fireEvent.click(screen.getByLabelText("Ask about this lesson"));
    expect(screen.getByRole("dialog", { name: "Lesson tutor" })).toBeInTheDocument();
    expect(screen.getByText("Quantum Algorithms")).toBeInTheDocument();
  });

  it("opens with Cmd-K and closes with it through the same close path", () => {
    render(<AskTutor />);
    const trigger = screen.getByLabelText("Ask about this lesson");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Lesson tutor" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus(); // close() ran, not a second inline copy of it
  });

  describe("the modal contract it claims with aria-modal", () => {
    it("locks body scroll and marks the background inert, restoring both on close", () => {
      // aria-modal HIDES the background from assistive tech; without inert and a
      // scroll lock the page it hides stays scrollable and pointer-reachable.
      const header = document.createElement("div");
      header.id = SITE_HEADER_ID;
      document.body.appendChild(header);

      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      expect(header).toHaveAttribute("inert");
      expect(document.body.style.overflow).toBe("hidden");

      fireEvent.click(screen.getByLabelText("Close tutor"));
      expect(header).not.toHaveAttribute("inert");
      expect(document.body.style.overflow).toBe("");
      header.remove();
    });

    it("leaves its OWN trigger reachable, since close() hands focus back to it", () => {
      render(<AskTutor />);
      const trigger = screen.getByLabelText("Ask about this lesson");
      expect(trigger.id).toBe(TUTOR_TRIGGER_ID); // in the shared inert list
      fireEvent.click(trigger);
      expect(trigger).not.toHaveAttribute("inert");
    });

    it("closes on Escape even after focus has left the dialog subtree", () => {
      // Clicking Ask used to evict focus to <body>, which is an ANCESTOR of the
      // dialog — a React onKeyDown prop never sees those keydowns, so Escape and
      // the focus trap died for the whole streaming window.
      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("dismisses on a scrim press, the only pointer exit on touch", () => {
      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      const scrim = document.querySelector(".animate-backdrop-fade");
      expect(scrim).toBeInTheDocument();
      fireEvent.mouseDown(scrim!);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("bounds the panel by the dynamic viewport so the composer clears iOS Safari's toolbar", () => {
      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      const dialog = screen.getByRole("dialog");
      expect(dialog.className).toContain("supports-[height:100dvh]:h-dvh");
      expect(dialog.className).not.toContain("inset-y-0");
      expect(dialog).toHaveAttribute("tabindex", "-1");
    });
  });

  it("streams a grounded answer, sending the current slug", async () => {
    const fetchMock = jest.fn().mockResolvedValue(streamResponse(["Inter", "ference ", "cancels."]));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AskTutor />);
    askQuestion();

    expect(await screen.findByText("Interference cancels.")).toBeInTheDocument();

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ slug: "03-algorithms", question: "why is it faster?" });
  });

  it("surfaces an in-band error sentinel as an error, keeping the partial answer", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        streamResponse(["Partial answer. ", `${TUTOR_ERROR_SENTINEL}the tutor hit an error.`])
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AskTutor />);
    askQuestion("q");

    expect(await screen.findByRole("alert")).toHaveTextContent(/error/i);
    expect(screen.getByText("Partial answer.")).toBeInTheDocument(); // partial kept
    // the sentinel/apology must NOT leak into the rendered answer
    expect(screen.queryByText((t) => t.includes("TUTOR-STREAM-ERROR"))).toBeNull();
  });

  it("announces two discrete transitions instead of putting the answer in a live region", async () => {
    // aria-live + aria-busy on the streaming answer prescribed opposite behaviours:
    // conforming AT deferred the entire stream, non-conforming AT re-announced the
    // whole accumulated answer on every chunk (setAnswer replaces the only text
    // node, so aria-atomic="false" never yields a delta).
    global.fetch = jest
      .fn()
      .mockResolvedValue(streamResponse(["Inter", "ference ", "cancels."])) as unknown as typeof fetch;

    render(<AskTutor />);
    askQuestion();
    expect(await screen.findByText("Interference cancels.")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("[aria-live]")).toHaveLength(0);
    expect(dialog.querySelectorAll("[aria-busy]")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Answer ready");
  });

  it("renders the out-of-scope refusal in the muted register, not as lesson prose", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(streamResponse([OUT_OF_SCOPE_MESSAGE])) as unknown as typeof fetch;

    render(<AskTutor />);
    askQuestion("q");

    const refusal = await screen.findByText(OUT_OF_SCOPE_MESSAGE);
    expect(refusal.className).toContain("text-caption");
    expect(refusal.className).not.toContain("text-(--ink)");
  });

  it("treats a stream that ends with nothing as a failure, not a finished empty answer", async () => {
    global.fetch = jest.fn().mockResolvedValue(streamResponse([])) as unknown as typeof fetch;

    render(<AskTutor />);
    askQuestion("q");

    expect(await screen.findByRole("alert")).toHaveTextContent(/did not send an answer/i);
  });

  describe("transport failures read as guidance, never as a status code", () => {
    it.each([
      [403, /too many questions/i],
      [429, /too many questions/i],
      [503, /unavailable right now/i],
    ])("maps %i to learner copy", async (status, copy) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      global.fetch = jest.fn().mockResolvedValue(failedResponse(status)) as unknown as typeof fetch;

      render(<AskTutor />);
      askQuestion("q");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(copy);
      expect(alert.textContent).not.toMatch(String(status));
      // the code stays available for debugging, just not in the learner's face
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(status)));
    });

    it("maps an unreachable endpoint to connection copy, not 'Failed to fetch'", async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

      render(<AskTutor />);
      askQuestion("q");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/check your connection/i);
      expect(alert.textContent).not.toMatch(/failed to fetch/i);
    });
  });

  it("clears the previous lesson's answer when the learner navigates to another lesson", async () => {
    // The panel lives in the ROOT layout, so route changes never unmount it: the
    // header re-labelled instantly while the old answer stayed on screen under it.
    global.fetch = jest
      .fn()
      .mockResolvedValue(streamResponse(["Interference cancels."])) as unknown as typeof fetch;

    const { rerender } = render(<AskTutor />);
    askQuestion();
    expect(await screen.findByText("Interference cancels.")).toBeInTheDocument();

    mockPathname = "/learn/05-quantum-chemistry";
    rerender(<AskTutor />);

    expect(screen.queryByText("Interference cancels.")).toBeNull();
    expect(screen.getByText("Quantum Chemistry & Biochemistry")).toBeInTheDocument();
  });

  describe("the composer", () => {
    it("caps input at exactly the length the handler slices to", () => {
      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      expect(screen.getByLabelText("Your question")).toHaveAttribute(
        "maxlength",
        String(MAX_QUESTION_CHARS)
      );
    });

    it("states the Enter / Shift+Enter contract a multi-line textarea otherwise hides", () => {
      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      expect(screen.getByText(/shift\+enter for a new line/i)).toBeInTheDocument();
    });

    it("blocks submission with aria-disabled, so the button keeps focus and its trap slot", () => {
      render(<AskTutor />);
      fireEvent.click(screen.getByLabelText("Ask about this lesson"));
      const submit = screen.getByRole("button", { name: "Ask" });
      expect(submit).toHaveAttribute("aria-disabled", "true");
      expect(submit).not.toBeDisabled(); // a hard `disabled` blurs to <body>
    });
  });

  it("restores focus to the trigger when the panel is closed", () => {
    render(<AskTutor />);
    const trigger = screen.getByLabelText("Ask about this lesson");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText("Close tutor"));
    expect(trigger).toHaveFocus();
  });
});
