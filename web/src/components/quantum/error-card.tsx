/**
 * The widget shell recipe and the shared failure card, split out of widget-ui
 * so `widget-fence` can render the failure state without statically importing
 * the whole primitive module (which pulls in the math kernel, the Dirac
 * readout and CopyButton). Every widget is code-split behind next/dynamic; the
 * fence itself ships in the lesson chunk, so what it imports eagerly matters.
 *
 * Both symbols are re-exported from `./widget-ui`, which stays the canonical
 * import path for widgets.
 */

// The smoke-and-glass widget shell: the `.glass` recipe (translucent fill +
// backdrop blur + hairline border + glass elevation) on a rounded card.
// Deliberately carries NO shadow utility — `.glass` already sets
// `box-shadow: var(--shadow-resting)`.
export const cardShell = "rounded-card glass";

/**
 * The failure state for a widget: a bad fence config, a parse error, or a
 * widget chunk that threw. Styled on the warm tier (the system's failure hue,
 * shared with CopyButton's failed state and the incorrect-verdict chips) so a
 * broken explorable is visually distinct from an ordinary muted caption.
 */
export function ErrorCard({
  label,
  message,
  className = "my-6",
}: {
  label: string;
  message?: string;
  className?: string;
}) {
  return (
    <div className={`not-prose ${className} ${cardShell} px-4 py-3`}>
      <p className="font-mono text-sm text-warm-dark dark:text-warm-light">
        {message ? `${label} error: ${message}` : `${label} error`}
      </p>
    </div>
  );
}
