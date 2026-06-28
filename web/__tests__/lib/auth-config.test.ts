/**
 * @jest-environment jsdom
 */
import { cognitoConfig, isAuthConfigured, amplifyAuthConfig } from "@/lib/auth-config";

interface AmplifyAuthShape {
  Auth: {
    Cognito: {
      userPoolId: string;
      userPoolClientId: string;
      loginWith: {
        oauth: {
          domain: string;
          scopes: string[];
          redirectSignIn: string[];
          redirectSignOut: string[];
          responseType: string;
        };
      };
    };
  };
}

const VARS = {
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-2_abc123",
  NEXT_PUBLIC_COGNITO_CLIENT_ID: "client123",
  NEXT_PUBLIC_COGNITO_DOMAIN: "quantum-altivum.auth.us-east-2.amazoncognito.com",
  NEXT_PUBLIC_AWS_REGION: "us-east-2",
};

function setAll() {
  for (const [k, v] of Object.entries(VARS)) process.env[k] = v;
}
function clearAll() {
  for (const k of Object.keys(VARS)) delete process.env[k];
}

describe("auth-config", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("isAuthConfigured is false when no vars are set", () => {
    expect(isAuthConfigured()).toBe(false);
    expect(cognitoConfig()).toBeNull();
    expect(amplifyAuthConfig()).toBeNull();
  });

  it("isAuthConfigured is false when any single var is missing", () => {
    setAll();
    delete process.env.NEXT_PUBLIC_AWS_REGION;
    expect(isAuthConfigured()).toBe(false);
    expect(cognitoConfig()).toBeNull();
  });

  it("cognitoConfig returns the four values when all are set", () => {
    setAll();
    expect(isAuthConfigured()).toBe(true);
    expect(cognitoConfig()).toEqual({
      userPoolId: "us-east-2_abc123",
      userPoolClientId: "client123",
      domain: "quantum-altivum.auth.us-east-2.amazoncognito.com",
      region: "us-east-2",
    });
  });

  it("amplifyAuthConfig builds an Amplify Auth.Cognito object with oauth + callback URLs", () => {
    setAll();
    const cfg = amplifyAuthConfig() as unknown as AmplifyAuthShape;
    const cognito = cfg.Auth.Cognito;
    expect(cognito.userPoolId).toBe("us-east-2_abc123");
    expect(cognito.userPoolClientId).toBe("client123");
    expect(cognito.loginWith.oauth.domain).toBe(
      "quantum-altivum.auth.us-east-2.amazoncognito.com"
    );
    expect(cognito.loginWith.oauth.scopes).toEqual(["openid", "email", "profile"]);
    expect(cognito.loginWith.oauth.responseType).toBe("code");
    expect(cognito.loginWith.oauth.redirectSignIn[0]).toMatch(/\/auth\/callback$/);
    expect(cognito.loginWith.oauth.redirectSignOut[0]).toMatch(/\/$/);
  });
});
