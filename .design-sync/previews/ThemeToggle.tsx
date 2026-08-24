// ThemeToggle — the light/dark switch from the site chrome. A next-themes shim
// makes it render standalone; it shows the icon for the opposite of the current
// theme (a moon in light, a sun in dark). No props.
import { ThemeToggle } from "quantum-ds";

export function Default() {
  return (
    <div style={{ padding: 20 }}>
      <ThemeToggle />
    </div>
  );
}
