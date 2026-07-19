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
import { TUTOR_ERROR_SENTINEL } from "@/lib/tutor";

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

  it("opens on the trigger and shows what it is grounded in", () => {
    render(<AskTutor />);
    fireEvent.click(screen.getByLabelText("Ask about this lesson"));
    expect(screen.getByRole("dialog", { name: "Lesson tutor" })).toBeInTheDocument();
    expect(screen.getByText("Algorithms")).toBeInTheDocument(); // slug -> label
  });

  it("opens with Cmd-K", () => {
    render(<AskTutor />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Lesson tutor" })).toBeInTheDocument();
  });

  it("streams a grounded answer, sending the current slug", async () => {
    const fetchMock = jest.fn().mockResolvedValue(streamResponse(["Inter", "ference ", "cancels."]));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AskTutor />);
    fireEvent.click(screen.getByLabelText("Ask about this lesson"));
    const input = screen.getByLabelText("Your question");
    fireEvent.change(input, { target: { value: "why is it faster?" } });
    fireEvent.keyDown(input, { key: "Enter" });

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
    fireEvent.click(screen.getByLabelText("Ask about this lesson"));
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "q" } });
    fireEvent.keyDown(screen.getByLabelText("Your question"), { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/error/i);
    expect(screen.getByText("Partial answer.")).toBeInTheDocument(); // partial kept
    // the sentinel/apology must NOT leak into the rendered answer
    expect(screen.queryByText((t) => t.includes("TUTOR-STREAM-ERROR"))).toBeNull();
  });

  it("renders the streamed answer inside a polite live region", () => {
    render(<AskTutor />);
    fireEvent.click(screen.getByLabelText("Ask about this lesson"));
    const live = screen.getByRole("dialog").querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
  });

  it("restores focus to the trigger when the panel is closed", () => {
    render(<AskTutor />);
    const trigger = screen.getByLabelText("Ask about this lesson");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText("Close tutor"));
    expect(trigger).toHaveFocus();
  });
});
