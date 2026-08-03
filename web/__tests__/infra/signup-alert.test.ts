import { readFileSync } from "fs";
import { join } from "path";

/**
 * Contract guard for the new-signup alerter in infra/workspace/cognito.yaml.
 *
 * This is not ordinary infrastructure. A Cognito PostConfirmation trigger sits
 * ON THE SIGN-UP PATH: if the function throws, Cognito surfaces the failure to
 * the caller, so a broken notifier becomes a broken front door for real people.
 * The properties below are the ones whose loss would be silent in review and
 * loud in production, so they are asserted structurally (same approach as
 * custom-http.test.ts — a regex scan, no YAML dependency).
 */

const YAML = readFileSync(
  join(__dirname, "..", "..", "..", "infra", "workspace", "cognito.yaml"),
  "utf8",
);

/** The inline handler source, between `ZipFile: |` and the next top-level key. */
function zipFileSource(): string {
  const start = YAML.indexOf("ZipFile: |");
  expect(start).toBeGreaterThan(-1);
  const rest = YAML.slice(start);
  // The block ends at the first line indented two spaces or less that is not blank.
  const lines = rest.split("\n").slice(1);
  const body: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      body.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= 2) break;
    body.push(line);
  }
  return body.join("\n");
}

describe("Cognito new-signup alerter", () => {
  it("wires PostConfirmation, which is the one trigger covering BOTH native and Google", () => {
    // Federated first sign-in invokes PostConfirmation_ConfirmSignUp, so this
    // single trigger sees email/password confirmations and Google sign-ins
    // alike. Switching to a native-only hook would silently miss every
    // federated signup — and Google signups are already a third of the pool.
    expect(YAML).toMatch(/LambdaConfig:\s*\n\s*PostConfirmation:\s*!GetAtt SignupAlertFunction\.Arn/);
  });

  it("creates the invoke permission BEFORE attaching the trigger", () => {
    // The pool references the function's ARN, so if the permission depended on
    // the pool it would have to be created after it — leaving a window where
    // the trigger exists but Cognito cannot invoke it. DependsOn closes that.
    expect(YAML).toMatch(/DeletionPolicy: Retain\s*\n\s*#[^\n]*\n\s*DependsOn: SignupAlertPermission/);
    // SourceAccount, not SourceArn — using the pool ARN would recreate the cycle.
    const perm = YAML.slice(YAML.indexOf("SignupAlertPermission:"));
    expect(perm).toContain("SourceAccount: !Ref AWS::AccountId");
    expect(perm.slice(0, perm.indexOf("UserPool:"))).not.toContain("SourceArn");
  });

  it("keeps the trigger inside Cognito's 5-second execution ceiling", () => {
    const fn = YAML.slice(YAML.indexOf("SignupAlertFunction:"));
    const timeout = /Timeout:\s*(\d+)/.exec(fn);
    expect(timeout).not.toBeNull();
    expect(Number(timeout![1])).toBeLessThanOrEqual(5);
  });

  describe("the handler must never throw — it is on the sign-up path", () => {
    const src = zipFileSource();

    it("wraps its work in try/catch and swallows the error", () => {
      expect(src).toContain("try {");
      expect(src).toMatch(/catch\s*\(\s*err\s*\)\s*{/);
      // The catch logs; it must not rethrow.
      const catchBody = src.slice(src.indexOf("catch (err)"));
      expect(catchBody).toContain("console.error");
      expect(catchBody).not.toMatch(/\bthrow\b/);
    });

    it("returns the event on every path, including after a failure", () => {
      // `return event` sits AFTER the catch block, so a failed publish still
      // hands Cognito a well-formed response and the sign-up completes.
      const catchIdx = src.indexOf("catch (err)");
      const returnIdx = src.lastIndexOf("return event;");
      expect(catchIdx).toBeGreaterThan(-1);
      expect(returnIdx).toBeGreaterThan(catchIdx);
    });

    it("contains no unguarded throw anywhere", () => {
      expect(src).not.toMatch(/^\s*throw\b/m);
    });

    it("clamps the SNS subject, which SNS would otherwise reject", () => {
      // SNS rejects a Subject over 100 chars or carrying control characters,
      // and that rejection would be an exception raised on the sign-up path.
      expect(src).toContain("function safeSubject");
      expect(src).toMatch(/\.replace\(\/\[\^\\x20-\\x7E\]\/g, ""\)/);
      expect(src).toMatch(/length > 99/);
    });

    it("flags internal accounts so they are not mistaken for cohort members", () => {
      // Three @altivum.ai accounts exist and must not occupy founding slots.
      expect(src).toContain("INTERNAL_DOMAIN");
      expect(src).toContain("does not occupy a founding-cohort slot");
    });

    it("warns that one human can hold two accounts", () => {
      // A person who signs up natively AND with Google gets two subs. The
      // alert says so, because otherwise two mails read as two people.
      expect(src).toMatch(/TWO accounts/);
    });
  });

  it("sends alerts somewhere, and says the subscription needs confirming", () => {
    expect(YAML).toContain("AWS::SNS::Topic");
    expect(YAML).toMatch(/Protocol: email/);
    expect(YAML).toMatch(/PendingConfirmation/);
  });
});
