// Bar — one probability/expectation row: a |label> ket, an accent-filled track,
// and a right-aligned mono readout. `marker` drops a thin vertical line at a
// second fraction (e.g. an expected value) and switches the track to
// overflow-visible so a line at 100% still shows.
import { Bar } from "quantum-ds";

export function Distribution() {
  // Measured shot frequencies for a slightly noisy Bell circuit.
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Bar label="00" fraction={0.481} valueText="48.1%" />
        <Bar label="01" fraction={0.018} valueText="1.8%" />
        <Bar label="10" fraction={0.026} valueText="2.6%" />
        <Bar label="11" fraction={0.475} valueText="47.5%" />
      </div>
    </div>
  );
}

export function ExpectationMarker() {
  // Measured P(|0>) bar with the ideal expectation marked at 0.50.
  return (
    <div style={{ padding: 20 }}>
      <Bar
        label="q0"
        fraction={0.73}
        valueWidth="w-24"
        valueText={
          <>
            0.73{" "}
            <span style={{ color: "var(--color-accent-dark)" }}>meas</span>
          </>
        }
        marker={{ fraction: 0.5, title: "ideal 0.50" }}
      />
    </div>
  );
}

export function Saturated() {
  // Full fill with a marker at 100% — the 2px line pokes past the rounded edge.
  return (
    <div style={{ padding: 20 }}>
      <Bar
        label="+"
        fraction={1}
        valueText="100%"
        marker={{ fraction: 1, title: "target" }}
      />
    </div>
  );
}
