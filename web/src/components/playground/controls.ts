// Shared class tokens for the playground bench's small controls, so the five
// panels can't drift on button chrome. Sibling in spirit to widget-ui's
// primary/secondaryActionClass, sized down for a dense bench (text-xs rows).

/** Small secondary action (Download, Resample, Load, Save, preset buttons). */
export const benchButtonClass =
  "rounded-control border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium " +
  "text-gray-700 hover:bg-gray-100 dark:border-gray-700/50 dark:bg-gray-900/50 " +
  "dark:text-gray-200 dark:hover:bg-gray-800 interactive focus-ring";

/** Small mono field (seed, circuit name inherits sizing per control). */
export const benchFieldClass =
  "rounded-control border border-gray-200 bg-gray-50 text-gray-900 " +
  "dark:border-gray-700/50 dark:bg-gray-900/50 dark:text-gray-100 focus-ring";

/** Tiny uppercase group label for palette / preset rows. */
export const benchGroupLabelClass =
  "w-16 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-caption";
