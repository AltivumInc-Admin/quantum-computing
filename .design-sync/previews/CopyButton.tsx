// CopyButton — the reusable copy-to-clipboard affordance (code fences, the Dirac
// state line, notebook paths). Swaps to a check icon + polite "Copied" for ~1.5s.
// At rest it is a compact icon button; the three cells show its distinct surfaces.
import { CopyButton } from "quantum-ds";

export function CopyState() {
  // Default: a quiet clipboard glyph, here copying a Dirac-notation state string.
  return (
    <div style={{ padding: 20 }}>
      <CopyButton getText={() => "(|00⟩ + |11⟩)/√2"} />
    </div>
  );
}

export function TintedInline() {
  // Emphasized variant via className: a persistent accent-tinted square, used
  // where the copy target is the primary action (copying runnable Python here).
  // The custom label is what assistive tech announces instead of "Copy".
  return (
    <div style={{ padding: 20 }}>
      <CopyButton
        getText={() =>
          "import numpy as np\nstate = np.array([1, 0, 0, 1]) / np.sqrt(2)"
        }
        label="Copy state as runnable Python"
        className="bg-accent/10"
      />
    </div>
  );
}

export function OnDarkFence() {
  // The variant used inside a code fence: light-on-dark chrome via className,
  // shown here against the fence's own dark surface.
  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "inline-flex",
          padding: 8,
          borderRadius: 12,
          background: "#0C1D17",
        }}
      >
        <CopyButton
          getText={() =>
            "from braket.circuits import Circuit\nbell = Circuit().h(0).cnot(0, 1)"
          }
          className="bg-gray-800/80 text-gray-300 hover:text-white"
        />
      </div>
    </div>
  );
}
