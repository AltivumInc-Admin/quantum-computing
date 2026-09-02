import { BillingAuthError } from "@/lib/billing-client";

/**
 * Navigation shared by the page's purchase controls.
 *
 * CheckoutButton and TopUp each carried a byte-identical `defaultNavigate` and
 * the same signed-out redirect branch. They are the only two `window.location.assign`
 * sites in web/src and they must agree: one of them silently drifting to a
 * different sign-up route would send half the buyers somewhere else.
 */

/** Where a signed-out purchase click goes — you cannot buy without an account. */
export const SIGNUP_PATH = "/login?mode=signup";

/**
 * A real navigation. Every consumer takes `navigate` as an injectable prop
 * defaulting to this, because jsdom locks window.location and the redirect is
 * the thing worth asserting.
 */
export function defaultNavigate(url: string) {
  window.location.assign(url);
}

/**
 * Handle the signed-out case: route to sign-up and report that the rejection is
 * dealt with, so the caller's catch can fall through to real error handling.
 * Returns false for anything else, untouched.
 */
export function routeIfSignedOut(e: unknown, navigate: (url: string) => void): boolean {
  if (e instanceof BillingAuthError) {
    navigate(SIGNUP_PATH);
    return true;
  }
  return false;
}
