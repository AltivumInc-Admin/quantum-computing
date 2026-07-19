import { TransitionLink } from "@/components/transition-link";
import { termSlug } from "@/lib/glossary";

// Renders a term's "see also" cross-references as links to those terms' own pages.
export function SeeAlsoLinks({ refs }: { refs?: string[] }) {
  if (!refs || refs.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-caption">
      See also:{" "}
      {refs.map((ref, i) => (
        <span key={ref}>
          <TransitionLink
            href={`/glossary/${termSlug(ref)}`}
            className="text-accent-dark dark:text-accent-light hover:underline focus-ring rounded"
          >
            {ref}
          </TransitionLink>
          {i < refs.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}
