// What the CURRENT session's access token is allowed to do — the difference
// between a native (SRP) sign-in and a hosted-UI (Google) one.
//
// Cognito grants `aws.cognito.signin.user.admin` on the non-OAuth auth flows, but
// an OAuth access token carries only the scopes the app client is configured to
// grant. The live `quantum-workspace-web` client grants openid/email/profile, so a
// Google-federated access token can NEVER carry the admin scope. Two consequences
// the UI has to respect:
//
//   1. Every scope-gated cognito-idp user API (GetUser, DeleteUser,
//      UpdateUserAttributes, …) fails for a Google session. Calling one anyway is
//      what took Google sign-in down on 2026-07-28.
//   2. It is also the reliable proxy for "signOut() will leave this page":
//      Amplify takes the OAuth sign-out branch — a full-page redirect to the
//      hosted-UI /logout endpoint — exactly for hosted-UI sessions.
//
// Widening the app client's allowed scopes would change (1), but only for sessions
// minted afterwards; existing tokens keep the scopes they were issued with. So this
// check stays correct either way — it asks the token, not the config.

/** The scope cognito-idp's signed-in-user APIs require. */
export const USER_POOL_ADMIN_SCOPE = "aws.cognito.signin.user.admin";

/**
 * True when this session's access token can call the scope-gated cognito-idp user
 * APIs. False for a hosted-UI (Google) session — and false when there is no
 * readable session at all, so callers fail toward doing nothing rather than
 * starting something they cannot finish.
 */
export async function hasUserPoolAdminScope(): Promise<boolean> {
  try {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const session = await fetchAuthSession();
    const scope = session.tokens?.accessToken?.payload?.scope;
    if (typeof scope !== "string") return false;
    return scope.split(" ").includes(USER_POOL_ADMIN_SCOPE);
  } catch {
    return false;
  }
}
