// WidgetCard — the rounded, rim-lit shell that wraps every explorable. Optional
// eyebrow / chips / headerRight compose a bordered header above the body.
import { WidgetCard, Chip, ProbBars } from "quantum-ds";

const s = Math.SQRT1_2;

export function WithHeader() {
  return (
    <WidgetCard
      eyebrow="Superposition"
      chips={
        <>
          <Chip>1 qubit</Chip>
          <Chip>H</Chip>
        </>
      }
      className=""
    >
      <div style={{ padding: 16 }}>
        <ProbBars probs={[0.5, 0.5]} n={1} />
      </div>
    </WidgetCard>
  );
}

export function WithHeaderRight() {
  return (
    <WidgetCard
      eyebrow="Bell state"
      headerRight={
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-accent-dark)" }}>
          entangled
        </span>
      }
      className=""
    >
      <div style={{ padding: 16 }}>
        <ProbBars probs={[0.5, 0, 0, 0.5]} n={2} />
      </div>
    </WidgetCard>
  );
}

export function Plain() {
  return (
    <WidgetCard className="">
      <div
        style={{
          padding: 20,
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "#48584F",
        }}
      >
        A bare card with no header &mdash; just the rounded, rim-lit shell wrapping content.
      </div>
    </WidgetCard>
  );
}
