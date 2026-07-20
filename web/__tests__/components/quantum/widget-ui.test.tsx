/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Bar,
  Chip,
  EyebrowLabel,
  ErrorCard,
  fieldClass,
  gateLabel,
  GateChip,
  LabeledSlider,
  LiveStatus,
  primaryActionClass,
  ProbBars,
  StateReadout,
  VerdictBadge,
  WidgetCard,
} from "@/components/quantum/widget-ui";
import { zeroState } from "@/components/quantum/math";

describe("GateChip", () => {
  it('marks the active chip with aria-current="step"', () => {
    render(<GateChip label="H q0" active />);
    expect(screen.getByText("H q0")).toHaveAttribute("aria-current", "step");
  });

  it("omits aria-current entirely on inactive chips", () => {
    render(<GateChip label="H q0" />);
    expect(screen.getByText("H q0")).not.toHaveAttribute("aria-current");
  });
});

describe("StateReadout", () => {
  it("hides the decorative py badge from assistive tech", () => {
    render(<StateReadout state={zeroState(1)} n={1} />);
    expect(screen.getByText("py")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("LiveStatus", () => {
  it("renders a polite, visually-hidden status region carrying its children", () => {
    render(<LiveStatus>hello world</LiveStatus>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("hello world");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders an empty region (nothing to announce) without error", () => {
    render(<LiveStatus>{""}</LiveStatus>);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("Bar", () => {
  it("renders the ket label, fill, and value text", () => {
    const { container } = render(
      <Bar label="01" fraction={0.75} valueText="75.0%" />
    );
    expect(screen.getByText(/\|01⟩/)).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    const fill = container.querySelector("span[style]");
    expect(fill).toHaveStyle({ width: "75.00%" });
  });

  it("clamps fraction > 1 to 100%", () => {
    const { container } = render(
      <Bar label="x" fraction={1.5} valueText="x" />
    );
    const fill = container.querySelector("span[style]");
    expect(fill).toHaveStyle({ width: "100.00%" });
  });

  it("clamps negative fraction to 0%", () => {
    const { container } = render(
      <Bar label="x" fraction={-0.3} valueText="x" />
    );
    const fill = container.querySelector("span[style]");
    expect(fill).toHaveStyle({ width: "0.00%" });
  });

  it("includes motion-reduce:transition-none on the fill", () => {
    const { container } = render(
      <Bar label="a" fraction={0.5} valueText="50%" />
    );
    const fill = container.querySelector("span[style]");
    expect(fill?.className).toContain("motion-reduce:transition-none");
  });

  it("renders a marker line at its fraction and switches the track to overflow-visible", () => {
    const { container } = render(
      <Bar label="0" fraction={0.4} valueText="40%" marker={{ fraction: 1, title: "Exact: 100%" }} />
    );
    const track = container.querySelector("span.relative")!;
    expect(track.className).toContain("overflow-visible");
    // At fraction 1 the 2px line sits at the clipped edge — overflow-visible is load-bearing.
    expect(container.querySelector('span[title="Exact: 100%"]')).toHaveStyle({ left: "100.00%" });
  });

  it("keeps overflow-hidden when no marker is given", () => {
    const { container } = render(<Bar label="0" fraction={0.4} valueText="x" />);
    expect(container.querySelector("span.relative")!.className).toContain("overflow-hidden");
  });

  it("applies valueWidth to the readout column and accepts a ReactNode valueText", () => {
    render(
      <Bar
        label="0"
        fraction={0.5}
        valueWidth="w-24"
        valueText={
          <>
            <span>12</span>
            <span> / 50%</span>
          </>
        }
      />
    );
    const first = screen.getByText("12");
    expect(first.parentElement!.className).toContain("w-24");
  });

  it("exposes a labelled row as a single named img-role node", () => {
    render(<Bar label="0" fraction={0.5} valueText="x" ariaLabel="Basis 0: exact 50%" />);
    // Must be role="img" — an aria-label on the bare div is prohibited naming
    // (role=generic) and screen readers ignore it.
    expect(screen.getByRole("img", { name: "Basis 0: exact 50%" })).toBeInTheDocument();
  });

  it("stays role-less without an ariaLabel", () => {
    const { container } = render(<Bar label="0" fraction={0.5} valueText="x" />);
    expect(container.querySelector("[role]")).toBeNull();
  });
});

describe("ProbBars", () => {
  it("renders default basisLabel ket labels and percentage values", () => {
    render(<ProbBars probs={[0.25, 0.75]} n={1} />);
    expect(screen.getByText(/\|0⟩/)).toBeInTheDocument();
    expect(screen.getByText(/\|1⟩/)).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });

  it("accepts a custom labelFor override", () => {
    render(
      <ProbBars
        probs={[1, 0, 0, 0]}
        n={2}
        labelFor={(i) => `v${i}`}
      />
    );
    expect(screen.getByText(/\|v0⟩/)).toBeInTheDocument();
    expect(screen.queryByText(/\|00⟩/)).not.toBeInTheDocument();
  });
});

describe("EyebrowLabel", () => {
  it("renders a span by default", () => {
    render(<EyebrowLabel>Circuit</EyebrowLabel>);
    const el = screen.getByText("Circuit");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("text-accent");
    expect(el.className).toContain("uppercase");
  });

  it('renders an h3 with id when as="h3"', () => {
    render(<EyebrowLabel as="h3" id="hw">Heading</EyebrowLabel>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Heading");
    expect(heading).toHaveAttribute("id", "hw");
  });
});

describe("Chip", () => {
  it("renders a mono pill with rounded-chip class", () => {
    render(<Chip>N = 8</Chip>);
    const el = screen.getByText("N = 8");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("rounded-chip");
    expect(el.className).toContain("font-mono");
  });
});

describe("WidgetCard", () => {
  it("renders children with cardShell classes and not-prose", () => {
    const { container } = render(
      <WidgetCard><p>body</p></WidgetCard>
    );
    expect(screen.getByText("body")).toBeInTheDocument();
    const outer = container.firstElementChild!;
    expect(outer.className).toContain("not-prose");
    expect(outer.className).toContain("rounded-card");
    // The smoke-and-glass shell: `.glass` carries the hairline border, the
    // translucent fill, the backdrop blur, and the glass elevation.
    expect(outer.className).toContain("glass");
  });

  it("adds overflow-hidden and header row when eyebrow is set", () => {
    const { container } = render(
      <WidgetCard eyebrow="Test"><p>body</p></WidgetCard>
    );
    const outer = container.firstElementChild!;
    expect(outer.className).toContain("overflow-hidden");
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Test").className).toContain("uppercase");
  });

  it("renders chips in the header alongside the eyebrow", () => {
    render(
      <WidgetCard eyebrow="X" chips={<Chip>3q</Chip>}><p>body</p></WidgetCard>
    );
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("3q")).toBeInTheDocument();
  });

  it("renders headerRight with justify-between layout", () => {
    const { container } = render(
      <WidgetCard eyebrow="A" headerRight={<span>status</span>}>
        <p>body</p>
      </WidgetCard>
    );
    const headerDiv = container.querySelector(".border-b")!;
    expect(headerDiv.className).toContain("justify-between");
    expect(screen.getByText("status")).toBeInTheDocument();
  });

  it("uses full header escape hatch when header prop is set", () => {
    render(
      <WidgetCard header={<div data-testid="custom">custom</div>}>
        <p>body</p>
      </WidgetCard>
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });

  it("omits overflow-hidden when no header", () => {
    const { container } = render(
      <WidgetCard><p>body</p></WidgetCard>
    );
    expect(container.firstElementChild!.className).not.toContain("overflow-hidden");
  });
});

describe("ErrorCard", () => {
  it("renders with cardShell classes and error text", () => {
    const { container } = render(
      <ErrorCard label="qsim" message="parse error" />
    );
    const outer = container.firstElementChild!;
    expect(outer.className).toContain("rounded-card");
    expect(outer.className).toContain("px-4");
    expect(screen.getByText("qsim error: parse error")).toBeInTheDocument();
  });
});

describe("fieldClass", () => {
  // Sizing baked into the token would silently lose to call-site overrides
  // (Tailwind conflicts resolve by stylesheet order, not class order) — the
  // token carries chrome only; each control appends its own px/py/text size.
  it("carries no padding or text-size utilities", () => {
    expect(fieldClass).not.toMatch(/\bp[xy]?-\d/);
    expect(fieldClass).not.toMatch(/\btext-(xs|sm|base|lg)\b/);
  });
  it("keeps the control chrome (radius, border, focus ring)", () => {
    expect(fieldClass).toContain("rounded-control");
    expect(fieldClass).toContain("focus-ring");
  });
});

describe("primaryActionClass", () => {
  // Guards the WCAG fix: the primary button must ride the accessible filled
  // surface (.surface-accent → accent-dark base, white text 5.09:1), never the
  // flat bg-accent it replaced (white text 2.25:1, sub-AA). See globals.css.
  it("uses the accessible .surface-accent and not the flat bg-accent fill", () => {
    expect(primaryActionClass).toContain("surface-accent");
    // Forbid the flat `bg-accent` fill only — not the accessible bg-accent-dark /
    // bg-accent-light variants (the trailing (?!-) keeps the hyphenated tokens legal).
    expect(primaryActionClass).not.toMatch(/\bbg-accent\b(?!-)/);
  });
});

describe("gateLabel", () => {
  it("renders a literal angle to two decimals", () => {
    expect(gateLabel({ gate: "RZ", target: 0, theta: 1.5708 })).toBe("RZ(1.57) q0");
  });

  it("snaps a tiny negative angle instead of printing the -0.00 wart", () => {
    // parseAngle deliberately accepts negative rotations, and raw
    // Number("-0.001").toFixed(2) is "-0.00" — the signed-zero display the #79
    // formatFixed campaign removed from every other readout.
    expect(gateLabel({ gate: "RZ", target: 0, theta: -0.001 })).toBe("RZ(0.00) q0");
  });

  it("keeps a genuinely negative angle signed", () => {
    expect(gateLabel({ gate: "RX", target: 1, theta: -1.5708 })).toBe("RX(-1.57) q1");
  });
});

describe("VerdictBadge", () => {
  it("carries the accent tone and a check glyph for a correct verdict", () => {
    const { container } = render(<VerdictBadge tone="accent">Solved</VerdictBadge>);
    const badge = screen.getByText(/Solved/);
    expect(badge.className).toContain("bg-accent/10");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("carries the warm failure tone and no check for a miss", () => {
    const { container } = render(<VerdictBadge tone="warm">Not quite</VerdictBadge>);
    expect(screen.getByText(/Not quite/).className).toContain("bg-warm/10");
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("LabeledSlider", () => {
  const base = {
    value: 5,
    min: 0,
    max: 10,
    step: 1,
    ariaLabel: "Depth",
    display: "5",
    onChange: () => {},
  };

  it("wires its own useId label htmlFor to the input id", () => {
    // Queried as an element, NOT by accessible name: the input also carries
    // aria-label, which wins the name computation — so a broken htmlFor would
    // silently kill click-label-to-focus without failing a getByLabelText test.
    const { container } = render(<LabeledSlider {...base} label="Depth" />);
    const label = container.querySelector("label")!;
    const input = container.querySelector("input[type=range]")!;
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.id).toBeTruthy();
  });

  it("renders no label element when label is omitted (aria-label only)", () => {
    const { container } = render(<LabeledSlider {...base} />);
    expect(container.querySelector("label")).toBeNull();
    expect(container.querySelector("input")).toHaveAttribute("aria-label", "Depth");
  });

  it("parses the raw value with parseFloat by default", () => {
    const onChange = jest.fn();
    const { container } = render(
      <LabeledSlider {...base} label="Theta" onChange={onChange} step={0.5} />
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "2.5" } });
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it("honors a parse override (integer sliders pass parseInt)", () => {
    const onChange = jest.fn();
    const { container } = render(
      <LabeledSlider
        {...base}
        label="Shots"
        onChange={onChange}
        parse={(raw) => parseInt(raw, 10)}
      />
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("passes aria-valuetext through to the input", () => {
    const { container } = render(
      <LabeledSlider {...base} label="Theta" ariaValueText="1.57 radians" />
    );
    expect(container.querySelector("input")).toHaveAttribute(
      "aria-valuetext",
      "1.57 radians"
    );
  });

  it("keeps the shared slider contract classes on the input", () => {
    const { container } = render(<LabeledSlider {...base} label="Depth" />);
    const input = container.querySelector("input")!;
    expect(input.className).toContain("slider");
    expect(input.className).toContain("focus-ring");
  });

  it("labelAbove stacks the label above the control row", () => {
    const { container } = render(
      <LabeledSlider {...base} label="Depth" labelAbove rowClassName="stack" />
    );
    const row = container.firstElementChild!;
    expect(row.className).toBe("stack");
    // label first, then the flex row holding the input + readout
    expect(row.children[0].tagName).toBe("LABEL");
    expect(row.children[1].querySelector("input[type=range]")).not.toBeNull();
  });

  it("injects `leading` before the input in the inline layout", () => {
    const { container } = render(
      <LabeledSlider {...base} label="Depth" leading={<button>play</button>} />
    );
    const row = container.firstElementChild!;
    expect(row.children[0].tagName).toBe("BUTTON");
    expect(row.children[1].tagName).toBe("LABEL");
  });
});
