/**
 * The AI-tutor band's visual: a working mock of the actual Ask-the-margin
 * panel rather than a photo — it shows the product interaction itself, costs
 * no asset bytes, and adapts to theme. Decorative (aria-hidden); the band
 * copy beside it carries the facts.
 */
export function TutorMock() {
  return (
    <div
      aria-hidden="true"
      className="rounded-card overflow-hidden border border-gray-200/60 dark:border-white/[0.08] bg-smoke shadow-(--shadow-resting) p-6 sm:p-8"
    >
      <div className="flex items-center justify-between gap-4 mb-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-accent-light">
          Ask the margin
        </p>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
            Cmd
          </kbd>
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
            K
          </kbd>
        </span>
      </div>
      {/* The frame pins the smoke ground in both themes, so both resting
          colors here sit on that dark ground — .text-caption's gray-500
          light value would be sub-AA on it. */}
      <p className="text-[11px] text-gray-400 dark:text-gray-300 mb-2">
        Reading: 03 — Quantum Algorithms
      </p>
      <div className="rounded-control border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-gray-200">
        Why does Grover&apos;s search only need about &radic;N queries?
      </div>
      <p className="mt-4 text-sm leading-relaxed text-gray-300">
        Each Grover iteration rotates the state a fixed angle toward the
        marked item, so its amplitude — not just its probability — grows
        with every step. Amplitudes square into probabilities, which is
        where the quadratic speedup lives: about &pi;/4&middot;&radic;N
        iterations instead of N/2 checks.
        <span className="animate-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent-light" />
      </p>
    </div>
  );
}
