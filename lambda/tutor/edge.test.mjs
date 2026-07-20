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
import { loadTemplate } from "./cfn-slice.mjs";

const { text: edge, body, typeOf, ofType } = loadTemplate("edge.yaml", import.meta.url);

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
