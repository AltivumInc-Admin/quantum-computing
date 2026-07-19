// The compose panel's gate palette as pure data, importable from server
// components (compose-panel is "use client", so the welcome page could not
// reach the const while it lived there). The welcome hero's "gates in the
// live playground" stat counts these chips directly — the same truth the
// unit test asserts — instead of dead-reckoning from the DSL registry.
export const PALETTE: {
  group: string;
  chips: { label: string; template: string }[];
  hint?: string;
}[] = [
  { group: "Basis", chips: ["H", "X", "Y", "Z"].map((g) => ({ label: g, template: `${g} 0` })) },
  { group: "Phase", chips: ["S", "T"].map((g) => ({ label: g, template: `${g} 0` })) },
  {
    group: "Rotate",
    chips: ["RX", "RY", "RZ"].map((g) => ({ label: g, template: `${g} 0 theta` })),
    hint: "theta binds to the slider",
  },
  { group: "Entangle", chips: [{ label: "CNOT", template: "CNOT 0 1" }] },
];
