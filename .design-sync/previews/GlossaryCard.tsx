// GlossaryCard — the companion "Reference" card that sits beside the numbered
// SectionCards in the welcome grid. No props; it renders one canonical thing.
import { GlossaryCard } from "quantum-ds";

export function Default() {
  return (
    <div style={{ padding: 20, maxWidth: 380 }}>
      <GlossaryCard />
    </div>
  );
}
