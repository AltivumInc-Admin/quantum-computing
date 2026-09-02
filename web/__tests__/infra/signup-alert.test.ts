import { readFileSync } from "fs";
import { join } from "path";

/**
 * Contract guard for the new-signup alerter in infra/workspace/cognito.yaml.
 *
 * This is not ordinary infrastructure. A Cognito PostConfirmation trigger sits
 * ON THE SIGN-UP PATH: if the function throws, Cognito surfaces the failure to
 * the caller, so a broken notifier becomes a broken front door for real people.
 *
 * The template facts below (which trigger, ordering, timeout, environment) are
 * asserted structurally — a regex scan, no YAML dependency, the same approach
 * as custom-http.test.ts. The HANDLER'S behaviour is not: the inline source is
 * extracted, compiled as the CommonJS module Code.ZipFile deploys, and RUN
 * against real events with a recording SNS stub, the way every lambda/ sibling
 * drives its core through injected deps. Text scans could not tell a
 * behaviour-preserving rewrite from a behaviour-breaking edit; these can.
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

type PublishInput = { TopicArn?: string; Subject?: string; Message?: string };

/** The env the template injects, plus the region the runtime always sets. */
const TOPIC_ARN = "arn-of-the-signup-topic";
const ENV = {
  TOPIC_ARN,
  INTERNAL_DOMAIN: "altivum.ai",
  AWS_REGION: "us-east-2",
};

/**
 * Compile the extracted source as CommonJS and hand back the handler plus the
 * recorders. `require`, `console` and `process` arrive as parameters, so the
 * module sees only the fakes — nothing reaches the real SDK or the real
 * environment, the same isolation the stubbed clients give lambda/analytics.
 */
function loadHandler(
  opts: { sendRejects?: Error; env?: Record<string, string> } = {},
) {
  const published: PublishInput[] = [];
  const clientConfigs: Record<string, unknown>[] = [];
  const logged: unknown[][] = [];
  const errored: unknown[][] = [];

  class PublishCommand {
    input: PublishInput;
    constructor(input: PublishInput) {
      this.input = input;
    }
  }
  class SNSClient {
    constructor(config: Record<string, unknown>) {
      clientConfigs.push(config);
    }
    async send(command: PublishCommand) {
      published.push(command.input);
      if (opts.sendRejects) throw opts.sendRejects;
      return {};
    }
  }

  const fakeRequire = (id: string) => {
    if (id === "@aws-sdk/client-sns") return { SNSClient, PublishCommand };
    throw new Error(`the inline handler may not require ${id}`);
  };
  const fakeConsole = {
    log: (...args: unknown[]) => logged.push(args),
    error: (...args: unknown[]) => errored.push(args),
  };
  const fakeProcess = { env: { ...ENV, ...(opts.env ?? {}) } };

  const factory = new Function(
    "require",
    "exports",
    "module",
    "console",
    "process",
    zipFileSource(),
  );
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  factory(fakeRequire, mod.exports, mod, fakeConsole, fakeProcess);

  const handler = mod.exports.handler as (event: unknown) => Promise<unknown>;
  expect(typeof handler).toBe("function");
  return { handler, published, clientConfigs, logged, errored };
}

/** A confirmed native sign-up, the shape Cognito actually sends. */
function signupEvent(over: Record<string, unknown> = {}) {
  return {
    triggerSource: "PostConfirmation_ConfirmSignUp",
    userPoolId: "us-east-2_examplepool",
    userName: "8f1c0d6e-4a2b-4f3d-9c1a-1d2e3f405162",
    request: {
      userAttributes: {
        email: "learner@example.com",
        sub: "8f1c0d6e-4a2b-4f3d-9c1a-1d2e3f405162",
      },
    },
    ...over,
  };
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

  it("injects the environment the handler reads", () => {
    // The executed cases below supply their own env, so only the template can
    // say these two are actually delivered to the deployed function.
    const fn = YAML.slice(
      YAML.indexOf("SignupAlertFunction:"),
      YAML.indexOf("SignupAlertPermission:"),
    );
    expect(fn).toMatch(/TOPIC_ARN:\s*!Ref SignupAlertTopic/);
    expect(fn).toMatch(/INTERNAL_DOMAIN:\s*\S+/);
  });

  it("owns its log group, so retention is stated and the group is not orphaned", () => {
    // Left implicit, Lambda creates the group outside the stack at
    // never-expire retention, untagged for cost allocation and orphaned on
    // delete — and a metric filter has nothing to attach to.
    const lg = YAML.slice(YAML.indexOf("SignupAlertLogGroup:"));
    expect(lg).toMatch(/Type: AWS::Logs::LogGroup/);
    expect(lg).toMatch(/LogGroupName: !Sub \/aws\/lambda\/\$\{SignupAlertFunction\}/);
    expect(lg).toMatch(/RetentionInDays: !Ref LogRetentionInDays/);
    expect(YAML).toMatch(/LogRetentionInDays:\s*\n\s*Type: Number/);
  });

  it("alarms on the publish failure the handler deliberately swallows", () => {
    // The catch is right — failing the front door would be worse — but it
    // means a permanently dark alerter looks exactly like a quiet week.
    // The metric filter and the string the handler logs must not drift
    // apart, so read the pattern out of the template and look for it in the
    // source rather than repeating the literal here.
    const pattern = /FilterPattern: '"([^"]+)"'/.exec(YAML);
    expect(pattern).not.toBeNull();
    expect(zipFileSource()).toContain(pattern![1]);

    const alarm = YAML.slice(YAML.indexOf("SignupAlertFailureAlarm:"));
    expect(alarm).toMatch(/Namespace: QuantumSignupAlert/);
    expect(alarm).toMatch(/MetricName: PublishFailed/);
    expect(alarm).toMatch(/TreatMissingData: notBreaching/);
    expect(alarm).toMatch(/AlarmActions:\s*\n\s*- !Ref SignupAlertTopic/);
  });

  it("watches the invocation itself, not only the failure it catches", () => {
    // The handler swallows everything inside its try, so AWS/Lambda Errors can
    // only fire for a failure OUTSIDE it — a module-load error, a timeout, a
    // throttle — and every one of those is a failed PostConfirmation trigger
    // Cognito surfaces to the person signing up. This is the one function in
    // the repo on a user-blocking path.
    for (const metric of ["Errors", "Throttles"]) {
      const alarm = YAML.slice(YAML.indexOf(`SignupAlert${metric}Alarm:`));
      expect(alarm).toMatch(/Namespace: AWS\/Lambda/);
      expect(alarm).toMatch(new RegExp(`MetricName: ${metric}`));
      expect(alarm).toMatch(
        /Dimensions:\s*\n\s*- Name: FunctionName\s*\n\s*Value: !Ref SignupAlertFunction/,
      );
      expect(alarm).toMatch(/AlarmActions:\s*\n\s*- !Ref SignupAlertTopic/);
    }
  });

  describe("the deployed module shape", () => {
    let src: string;
    beforeAll(() => {
      // In a hook, not at describe scope: a failure to find the block is then
      // a failing test rather than an error during collection.
      src = zipFileSource();
    });

    it("is CommonJS, because Code.ZipFile deploys it as a bare index.js", () => {
      // No package.json travels with an inline ZipFile, so there is no
      // `"type": "module"` and the runtime loads index.js as CommonJS. An
      // ESM `import`/`export` would be a SyntaxError raised at module load —
      // outside the handler's try, so the never-throw contract would never
      // run and every sign-up would see a failed trigger.
      expect(src).toContain('require("@aws-sdk/client-sns")');
      expect(src).toContain("exports.handler");
      expect(src).not.toMatch(/^\s*import\s/m);
      expect(src).not.toMatch(/^\s*export\s/m);
    });

    it("contains no unguarded throw anywhere", () => {
      // The executed cases below prove the paths they drive return the event.
      // This one covers a throw added to a path no fixture reaches.
      expect(src).not.toMatch(/^\s*throw\b/m);
    });
  });

  describe("the handler, executed — it must never throw, it is on the sign-up path", () => {
    it("publishes one alert for a native sign-up and returns the event", async () => {
      const { handler, published } = loadHandler();
      const event = signupEvent();

      await expect(handler(event)).resolves.toBe(event);

      expect(published).toHaveLength(1);
      expect(published[0].TopicArn).toBe(TOPIC_ARN);
      expect(published[0].Subject).toBe(
        "New Quantum Learner signup: learner@example.com",
      );
      expect(published[0].Message).toContain("Email:     learner@example.com");
      expect(published[0].Message).toContain("email + password");
      // Two mails can be one human; the body has to say so or they read as two.
      expect(published[0].Message).toContain("TWO accounts");
    });

    it("bounds the publish so it cannot outlive the function timeout", async () => {
      // The SDK defaults are up to 3 attempts and NO request timeout, so a
      // stalled SNS endpoint would leave the handler awaiting send when the
      // function timeout fires. A Lambda timeout is not an exception: the
      // catch never runs, the event is never returned, and Cognito gets the
      // trigger failure the never-throw contract exists to prevent. The
      // ceiling is the template's own Timeout, read from the template so the
      // two cannot be tuned apart.
      const { handler, clientConfigs } = loadHandler();
      await handler(signupEvent());

      const config = clientConfigs[0] as {
        maxAttempts?: number;
        requestHandler?: { connectionTimeout?: number; requestTimeout?: number };
      };
      expect(config.maxAttempts).toBeGreaterThan(0);
      expect(config.requestHandler?.connectionTimeout).toBeGreaterThan(0);
      expect(config.requestHandler?.requestTimeout).toBeGreaterThan(0);

      const fn = YAML.slice(YAML.indexOf("SignupAlertFunction:"));
      const timeoutMs = Number(/Timeout:\s*(\d+)/.exec(fn)![1]) * 1000;
      expect(config.maxAttempts! * config.requestHandler!.requestTimeout!).toBeLessThan(
        timeoutMs,
      );
    });

    it("names Google as the sign-in method for a federated userName", async () => {
      const { handler, published } = loadHandler();
      // Federated users arrive provider-prefixed; native sign-ups do not.
      await handler(signupEvent({ userName: "Google_112233445566" }));

      expect(published).toHaveLength(1);
      expect(published[0].Message).toContain("Sign-in:   Google");
    });

    it("publishes NOTHING for a password reset", async () => {
      // PostConfirmation also fires on ConfirmForgotPassword. Alerting there
      // mails "New Quantum Learner signup" about a learner who joined months
      // ago and inflates the founding-cohort count the alert exists to feed.
      const { handler, published, logged } = loadHandler();
      const event = signupEvent({
        triggerSource: "PostConfirmation_ConfirmForgotPassword",
      });

      await expect(handler(event)).resolves.toBe(event);

      expect(published).toHaveLength(0);
      // The skip still leaves a trace in the log group.
      expect(logged.flat()).toContain("PostConfirmation_ConfirmForgotPassword");
    });

    it("still returns the event when the attributes are missing entirely", async () => {
      const { handler, published } = loadHandler();
      const event = { triggerSource: "PostConfirmation_ConfirmSignUp" };

      await expect(handler(event)).resolves.toBe(event);

      expect(published).toHaveLength(1);
      expect(published[0].Subject).toContain("no email attribute");
    });

    it("swallows an SNS rejection — the sign-up completes anyway", async () => {
      const { handler, errored } = loadHandler({
        sendRejects: new Error("Throttling: Rate exceeded"),
      });
      const event = signupEvent();

      await expect(handler(event)).resolves.toBe(event);

      expect(errored).toHaveLength(1);
      expect(errored[0][0]).toContain("signup alert failed");
    });

    it("clamps a subject SNS would otherwise reject", async () => {
      // SNS rejects a Subject over 100 characters or carrying control
      // characters, and that rejection would be an exception on the sign-up
      // path. An address is user-supplied, so clamp rather than trust it.
      const { handler, published } = loadHandler();
      const long = "a".repeat(300) + "é@example.com";
      await handler(
        signupEvent({ request: { userAttributes: { email: long } } }),
      );

      const subject = published[0].Subject!;
      expect(subject.length).toBeLessThanOrEqual(100);
      expect(subject).toMatch(/^[\x20-\x7E]*$/);
    });

    it("flags an internal account so it does not occupy a founding-cohort slot", async () => {
      const { handler, published } = loadHandler();
      // Upper-cased on purpose: the domain match must not depend on how the
      // address was typed.
      await handler(
        signupEvent({
          request: { userAttributes: { email: "staff@ALTIVUM.AI" } },
        }),
      );

      expect(published[0].Message).toContain(
        "does not occupy a founding-cohort slot",
      );
    });

    it("does not flag an ordinary address as internal", async () => {
      const { handler, published } = loadHandler();
      await handler(
        signupEvent({
          request: { userAttributes: { email: "someone@gmail.com" } },
        }),
      );

      expect(published[0].Message).toContain("This is an external signup.");
      expect(published[0].Message).not.toContain("founding-cohort slot");
    });
  });

  it("sends alerts somewhere, and says the subscription needs confirming", () => {
    expect(YAML).toContain("AWS::SNS::Topic");
    expect(YAML).toMatch(/Protocol: email/);
    expect(YAML).toMatch(/PendingConfirmation/);
  });
});
