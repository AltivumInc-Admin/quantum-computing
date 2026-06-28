// Single source of the Cognito env gate. Reads process.env at CALL TIME (not at
// import time) so tests can set/clear vars per-case, exactly like ask-tutor.tsx.
// All four values are PUBLIC client identifiers — safe to inline as NEXT_PUBLIC_*.
// The feature stays fully inert until all four are present (mirrors the tutor's
// NEXT_PUBLIC_TUTOR_URL gate).

export interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  /** Hosted-UI domain HOST (no scheme), used only for the Google OAuth hop. */
  domain: string;
  /** Collected for the gate + the future sync-backend API client; the userPoolId
   *  already encodes the region for Amplify Auth itself. */
  region: string;
}

export function cognitoConfig(): CognitoConfig | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const region = process.env.NEXT_PUBLIC_AWS_REGION;
  if (!userPoolId || !userPoolClientId || !domain || !region) return null;
  return { userPoolId, userPoolClientId, domain, region };
}

export function isAuthConfigured(): boolean {
  return cognitoConfig() !== null;
}

export function amplifyAuthConfig(): Record<string, unknown> | null {
  const c = cognitoConfig();
  if (!c) return null;
  // Absolute redirect URIs must match the Cognito app client's allowed callback /
  // logout URLs. Deriving from the live origin covers prod and localhost:3000.
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://quantum.altivum.ai";
  return {
    Auth: {
      Cognito: {
        userPoolId: c.userPoolId,
        userPoolClientId: c.userPoolClientId,
        loginWith: {
          oauth: {
            domain: c.domain,
            scopes: ["openid", "email", "profile"],
            redirectSignIn: [`${origin}/auth/callback`],
            redirectSignOut: [`${origin}/`],
            responseType: "code",
          },
        },
      },
    },
  };
}
