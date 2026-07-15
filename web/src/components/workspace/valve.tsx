import Link from "next/link";
import { Panel } from "./panel";
import type { WorkspaceModel } from "@/lib/workspace";

/**
 * Z2 — THE VALVE. The one control that moves the retention line: the due count in
 * display-2xl, a named breakdown by Rep kind, the honest stake ("N are retained skills
 * — an 'Again' resets them to 1 day", which schedule() genuinely does), and the page's
 * ONE filled CTA. The action is chosen by the deterministic precedence resolver, so the
 * slot is NEVER blank and NEVER congratulates. NO aria-live on the count — it would
 * spam a screen reader on every grade.
 */
export function Valve({
  valve,
  due,
  dueKinds,
  dueRetained,
}: Pick<WorkspaceModel, "valve" | "due" | "dueKinds" | "dueRetained">) {
  return (
    <Panel title="Due now" id="ws-valve" className="flex flex-col">
      <dl>
        <dt className="sr-only">Reps due today</dt>
        <dd className="font-display text-display-2xl leading-none tracking-tight text-gray-900 tabular-nums dark:text-white">
          {due}
          <span className="sr-only"> Reps due today</span>
        </dd>
      </dl>

      {dueKinds.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {dueKinds.map((k) => (
            <li key={k.kind} className="flex items-center gap-3">
              <span className="min-w-[1rem] font-semibold tabular-nums text-gray-900 dark:text-white">
                {k.count}
              </span>
              <span className="text-gray-600 dark:text-gray-300">{k.label}</span>
            </li>
          ))}
        </ul>
      )}

      {dueRetained > 0 && (
        <p className="mt-4 border-t border-gray-200/60 pt-3 text-xs leading-relaxed text-caption dark:border-white/[0.06]">
          <span className="font-medium text-warm-dark dark:text-warm-light">
            {dueRetained} {dueRetained === 1 ? "is a retained skill" : "are retained skills"}
          </span>{" "}
          — an &ldquo;Again&rdquo; resets {dueRetained === 1 ? "it" : "them"} to a 1-day interval.
        </p>
      )}

      {valve.headline && (
        <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {valve.headline}
        </p>
      )}

      <div className="mt-4">
        <ValveCta valve={valve} />
      </div>
    </Panel>
  );
}

/** The single .surface-accent element on the page, in every state. */
function ValveCta({ valve }: { valve: WorkspaceModel["valve"] }) {
  const cls =
    "block w-full rounded-control surface-accent px-4 py-2.5 text-center text-sm font-semibold interactive focus-ring";
  if (valve.external) {
    return (
      <a href={valve.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {valve.cta}
      </a>
    );
  }
  return (
    <Link href={valve.href} className={cls}>
      {valve.cta}
    </Link>
  );
}
