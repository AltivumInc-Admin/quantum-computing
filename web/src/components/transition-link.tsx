"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type TransitionLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: ReactNode;
  };

/**
 * A drop-in <Link> that routes in-app navigation through the View Transitions
 * API, so moving between lessons cross-fades/slides like turning a page (styled
 * via ::view-transition-* in globals.css) instead of hard-cutting.
 *
 * It degrades cleanly: modified / non-primary clicks fall through to the browser
 * (new tab, etc.); where the API is absent (Firefox, older Safari) or the reader
 * prefers reduced motion, it does a normal client navigation with no transition.
 * The underlying <Link> still renders and prefetches.
 */
export function TransitionLink({ href, children, onClick, ...props }: TransitionLinkProps) {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Let the browser handle new-tab / modified / non-primary clicks.
    if (
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return;
    }
    // No API, or the reader opted out of motion → plain client navigation.
    if (typeof document === "undefined" || !document.startViewTransition) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    e.preventDefault();
    document.startViewTransition(() => router.push(String(href)));
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
