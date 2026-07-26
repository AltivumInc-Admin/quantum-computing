/**
 * Guardrail tests for edge.yaml — the stack that holds every actual access
 * control in front of the tutor: the WAF rate limit, the OAC signing that lets
 * the Function URL stay locked to AWS_IAM, and the disabled cache that keeps one
 * learner's streamed answer from being served to the next.
 *
 * template.test.mjs pins the alarm wiring line by line precisely because silent
 * config drift in this stack is invisible at runtime — but it reads only
 * template.yaml, so until now the security boundary itself had no coverage. Each
 * assertion below guards a single-token YAML edit that ships green and returns
 * 200 while removing a control.
 *
 * Run: `cd lambda/tutor && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTemplate, section, blocks } from "./cfn-slice.mjs";
import { readFileSync } from "node:fs";

const { text: edge, body, typeOf, ofType } = loadTemplate("edge.yaml", import.meta.url);
// The main (us-east-2) stack, read ONLY to cross-check the one value the two
// stacks must agree on: the browser origin. See the AllowedOrigin test below.
const main = readFileSync(new URL("./template.yaml", import.meta.url), "utf8");

/** The `Default:` of a top-level Parameter, or undefined if it has none. */
function paramDefault(text, name) {
  const param = blocks(section(text, "Parameters"))[name];
  assert.ok(param, `template has no ${name} parameter`);
  return param.join("\n").match(/^\s+Default: (.+)$/m)?.[1]?.trim();
}

/** AWS Managed-CachingDisabled. Any other id caches the streamed answer. */
const MANAGED_CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";

test("the distribution is governed by the WAF web ACL", () => {
  const dist = body("TutorDistribution");
  assert.ok(dist, "TutorDistribution missing");
  // Dropping WebACLId leaves the endpoint fully functional and completely
  // unthrottled — the rate limit is the only thing bounding paid Bedrock spend
  // from an anonymous caller.
  assert.match(dist, /WebACLId: !GetAtt TutorWebAcl\.Arn/, "distribution must reference the web ACL");
  assert.equal(typeOf("TutorWebAcl"), "AWS::WAFv2::WebACL");
});

test("the rate-limit rule blocks per source IP and returns the 429 it documents", () => {
  const acl = body("TutorWebAcl");
  assert.match(acl, /Name: PerIpRateLimit/);
  assert.match(acl, /AggregateKeyType: IP/, "rate limit must aggregate per source IP");
  assert.match(acl, /Limit: !Ref RateLimitPerMinute/, "limit must stay operator-tunable");
  assert.match(acl, /EvaluationWindowSec: 60/);
  assert.match(acl, /DefaultAction:\s*\n\s*Allow: \{\}/, "web ACL must default to Allow, not Block");
  // WAF's default Block response is 403 — the same status returned by an unsigned
  // direct hit to the AWS_IAM Function URL and by a POST missing the body hash.
  // Without an explicit 429 a throttled learner is indistinguishable from a
  // broken OAC signature in both the client and the CloudFront logs.
  assert.match(acl, /CustomResponse:\s*\n\s*ResponseCode: 429/, "block must return 429, not WAF's default 403");
  assert.match(acl, /CustomResponseBodies:/, "429 needs a body the client can read");

  // The referenced body must actually exist under CustomResponseBodies, and its
  // key must satisfy WAF's CustomResponseBodyKey pattern (^[\w\-]+$) — a key with
  // any other character is rejected at deploy, not at lint.
  const key = acl.match(/CustomResponseBodyKey: (\S+)/)?.[1];
  assert.ok(key, "the 429 must reference a custom response body");
  assert.match(key, /^[\w-]+$/, `CustomResponseBodyKey "${key}" violates WAF's ^[\\w\\-]+$ pattern`);
  assert.match(acl, new RegExp(`CustomResponseBodies:\\s*\\n\\s*${key}:`), `no body defined for key ${key}`);
});

test("the 429 carries the CORS header without which no browser can READ it", () => {
  // The gap this closes: a WAF block is generated at the EDGE, so the request never
  // reaches the origin and the Function URL's own Cors block never runs. The site
  // (quantum.altivum.ai) is cross-origin to this distribution, and ask-tutor.tsx
  // sends `content-type: application/json` plus `x-amz-content-sha256` — neither is
  // CORS-safelisted, so every call is preflighted and every response is CORS-checked.
  // Streaming does not exempt it: res.body.getReader() only runs on a CORS-ok
  // response. Strip Access-Control-Allow-Origin and the browser DISCARDS the 429:
  // fetch rejects with TypeError, res.status is never observed, and ask-tutor's
  // catch reports tutor.unreachable — the outage claim for a wait-a-minute
  // condition. Nothing at deploy time or in any metric shows this; the WAF reports
  // a blocked request either way.
  const acl = body("TutorWebAcl");
  const from = acl.indexOf("CustomResponse:");
  assert.notEqual(from, -1, "the rate-limit block no longer has a CustomResponse");
  const customResponse = acl.slice(from, acl.indexOf("Statement:", from));
  assert.match(
    customResponse,
    /ResponseHeaders:\s*\n\s*- Name: Access-Control-Allow-Origin\s*\n\s*Value: !Ref AllowedOrigin/,
    "the 429 must carry Access-Control-Allow-Origin, sourced from the AllowedOrigin parameter",
  );
  // Not credentials-mode: ask-tutor's fetch never sets credentials, and the
  // endpoint is anonymous. Allow-Credentials would advertise a cookie contract
  // this endpoint does not have.
  assert.doesNotMatch(customResponse, /Access-Control-Allow-Credentials/);
});

test("the allowed-origin DEFAULTS cannot drift between edge.yaml and template.yaml", () => {
  // Two stacks, one allowlist. template.yaml (us-east-2) decides who may read a
  // NORMAL response via the Function URL's Cors.AllowOrigins; this stack decides
  // who may read the THROTTLED one. If the two disagree, the throttle goes
  // unreadable in exactly the case it was created for, and the failure is
  // invisible until a real learner is being rate limited.
  //
  // HONEST SCOPE: this pins the templates' Default: lines, which is all an
  // offline test can see. Both stacks deploy with explicit --parameter-overrides,
  // so an operator overriding one side differently still produces the drift this
  // test cannot catch — the deploy runbook passes AllowedOrigin explicitly on
  // both for exactly that reason.
  const here = paramDefault(edge, "AllowedOrigin");
  const there = paramDefault(main, "AllowedOrigin");
  assert.ok(here, "edge.yaml must parameterize AllowedOrigin, not hardcode an origin");
  assert.equal(here, there, "edge.yaml and template.yaml disagree on AllowedOrigin");
  assert.match(here, /^https:\/\//, "the allowed origin must be https");
  // A single static header can name ONE origin. That is lossless only while
  // template.yaml also lists exactly one; a second entry there (a localhost dev
  // origin, say) would silently lose the ability to read a throttle.
  assert.notEqual(here, "*", "a wildcard would expose this endpoint's responses to any origin");
});

test("CORS preflights are exempt from the rate limit, which is what makes the 429 reachable", () => {
  // A preflight must answer with an ok (2xx) status or the browser treats the whole
  // request as a network error — so a preflight blocked with 429 cannot be rescued
  // by any header, and the Access-Control-Allow-Origin above would never be seen.
  // CloudFront forwards OPTIONS and every ask-tutor call is preflighted, so the
  // burst that trips the limit would otherwise block the preflight too.
  const acl = body("TutorWebAcl");
  const rate = acl.slice(acl.indexOf("RateBasedStatement:"));
  assert.match(rate, /ScopeDownStatement:/, "preflights must be excluded from the rate count");
  // Polarity is the whole test. Dropping `NotStatement` inverts it: the rule would
  // then count ONLY preflights and leave POST — the path that invokes Bedrock —
  // with no rate limit at all, while every metric and every deploy stayed green.
  assert.match(
    rate,
    /ScopeDownStatement:\s*\n\s*NotStatement:\s*\n\s*Statement:\s*\n\s*ByteMatchStatement:/,
    "the scope-down must be a NotStatement; without it the rate limit inverts",
  );
  assert.match(rate, /FieldToMatch:\s*\n\s*Method: \{\}/, "the exemption must key on the HTTP method");
  assert.match(rate, /PositionalConstraint: EXACTLY/);
  assert.match(rate, /SearchString: OPTIONS/);
});

test("the origin is signed with SigV4 on every request (OAC)", () => {
  const oac = body("TutorOAC");
  assert.equal(typeOf("TutorOAC"), "AWS::CloudFront::OriginAccessControl");
  // 'never'/'no-override' would stop signing while everything still returns 200
  // through CloudFront — and silently strand the AWS_IAM Function URL.
  assert.match(oac, /SigningBehavior: always/, "OAC must sign every request");
  assert.match(oac, /SigningProtocol: sigv4/);
  assert.match(oac, /OriginAccessControlOriginType: lambda/);
  assert.match(
    body("TutorDistribution"),
    /OriginAccessControlId: !GetAtt TutorOAC\.Id/,
    "the origin must actually use the OAC",
  );
});

test("caching stays disabled so one learner's answer is never served to another", () => {
  const dist = body("TutorDistribution");
  // The response is a per-question stream. Any caching policy other than
  // Managed-CachingDisabled would serve learner A's answer to learner B asking a
  // different question on a different lesson — a correctness AND privacy failure
  // that looks completely normal in every metric.
  assert.ok(
    dist.includes(`CachePolicyId: ${MANAGED_CACHING_DISABLED}`),
    `CachePolicyId must be Managed-CachingDisabled (${MANAGED_CACHING_DISABLED})`,
  );
  assert.match(dist, /Compress: false/, "compression would buffer the stream");
  assert.match(dist, /AllowedMethods: \[GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE\]/, "POST must be allowed");
  assert.match(dist, /ViewerProtocolPolicy: redirect-to-https/);
});

test("the origin request policy forwards the body hash but not Host", () => {
  // Managed-AllViewerExceptHostHeader. Forwarding Host would break the SigV4
  // signature OAC computes against the Function URL domain.
  assert.match(body("TutorDistribution"), /OriginRequestPolicyId: b689b0a8-53d0-40ab-baf2-68738e2966ac/);
});

test("no rule blocks with WAF's default response while the prose promises 429", () => {
  // The original defect: a bare `Block: {}` emits WAF's default 403, but the
  // stack description, the RateLimitPerMinute description and the README all
  // said 429. Anyone writing client-side error mapping would have added a 429
  // branch that could never execute. A bare Block is now the failure condition.
  assert.doesNotMatch(
    edge,
    /Action:\s*\n\s*Block: \{\}/,
    "a bare `Block: {}` returns 403 — give it an explicit CustomResponse or fix the prose",
  );
  // And the documented status must be the one the rule emits.
  assert.match(edge, /ResponseCode: 429/);
  assert.match(edge, /HTTP 429/, "the stack description should state the status operators will see");
});
