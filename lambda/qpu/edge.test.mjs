/**
 * Guardrail tests for edge.yaml — the stack that holds every access control in
 * front of the money-spending submit API: the WAF rate limit, the AWS managed
 * common rule set, and the injected x-qpu-edge header that makes the public HTTP
 * API URL unusable on its own.
 *
 * template.test.mjs pins the notification wiring for the same reason this file
 * exists: drift in either stack is invisible at runtime — the endpoint keeps
 * returning 200 with a control removed. Each assertion below guards a
 * single-token YAML edit that ships green while dropping a boundary.
 *
 * Run: `cd lambda/qpu && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edge = readFileSync(new URL("./edge.yaml", import.meta.url), "utf8");
const core = readFileSync(new URL("./qpu-core.mjs", import.meta.url), "utf8");
// The main (us-east-2) stack, read ONLY to cross-check the one value the two
// stacks must agree on: the browser origin. See the SiteOrigin test below.
const main = readFileSync(new URL("./template.yaml", import.meta.url), "utf8");

/**
 * Body of one 2-space-indented Resources block. CloudFormation intrinsics
 * (!Ref, !Sub, !GetAtt) mean no plain YAML parser loads this file without custom
 * tags, so the suite slices by indentation instead of adding a YAML dependency
 * to a Lambda whose whole point is being dependency-free. Kept local for the
 * same reason template.test.mjs keeps its own copy: lambda/tutor's shared
 * cfn-slice.mjs belongs to a separate, independently deployed npm package.
 */
function resource(id) {
  return block(edge, id);
}

/** The same indentation slice, against any of the two templates. */
function block(text, id) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`  ${id}:`);
  assert.notEqual(start, -1, `template has no ${id} block`);
  const out = [];
  for (let i = start + 1; i < lines.length && !/^ {0,2}\S/.test(lines[i]); i++) out.push(lines[i]);
  return out.join("\n");
}

/** The `Default:` of a top-level Parameter, or undefined if it has none. */
function paramDefault(text, name) {
  return block(text, name).match(/^\s+Default: (.+)$/m)?.[1]?.trim();
}

test("the distribution is governed by the WAF web ACL", () => {
  // Dropping WebACLId leaves the API fully functional and completely unthrottled
  // — the rate limit is the only thing bounding how fast an authenticated caller
  // can push submits at the hard caps.
  assert.match(resource("QpuDistribution"), /WebACLId: !GetAtt QpuWebAcl\.Arn/);
  assert.match(resource("QpuWebAcl"), /Type: AWS::WAFv2::WebACL/);
});

test("the rate-limit rule blocks per source IP and returns the 429 it documents", () => {
  const acl = resource("QpuWebAcl");
  assert.match(acl, /Name: PerIpRateLimit/);
  assert.match(acl, /AggregateKeyType: IP/, "rate limit must aggregate per source IP");
  assert.match(acl, /Limit: !Ref RateLimitPerMinute/, "limit must stay operator-tunable");
  assert.match(acl, /EvaluationWindowSec: 60/);
  assert.match(acl, /DefaultAction:\s*\n\s*Allow: \{\}/, "web ACL must default to Allow, not Block");
  assert.match(acl, /CustomResponse:\s*\n\s*ResponseCode: 429/, "block must return 429, not WAF's default 403");

  // The referenced body must actually exist under CustomResponseBodies, and its
  // key must satisfy WAF's CustomResponseBodyKey pattern (^[\w\-]+$) — a key with
  // any other character is rejected at deploy, not at lint.
  const key = acl.match(/CustomResponseBodyKey: (\S+)/)?.[1];
  assert.ok(key, "the 429 must reference a custom response body");
  assert.match(key, /^[\w-]+$/, `CustomResponseBodyKey "${key}" violates WAF's ^[\\w\\-]+$ pattern`);
  assert.match(acl, new RegExp(`CustomResponseBodies:\\s*\\n\\s*${key}:`), `no body defined for key ${key}`);
});

test("a throttle is distinguishable from the edge-secret rejection it used to mimic", () => {
  // The defect this locks shut: a bare `Block: {}` emitted WAF's default 403, and
  // qpu-core.mjs's edge gate ALSO answers 403 when the injected x-qpu-edge header
  // doesn't match (secret replica drift). Same status, same shape, two completely
  // different operator actions — "wait a minute" vs "the stacks disagree".
  const gate = core.slice(core.indexOf('"x-qpu-edge"'));
  assert.ok(core.includes('"x-qpu-edge"'), "qpu-core.mjs no longer has an edge gate to disambiguate from");
  assert.match(gate.slice(0, 200), /json\(403/, "the edge gate's status changed — recheck the 429 rationale");
  assert.doesNotMatch(
    edge,
    /Action:\s*\n\s*Block: \{\}/,
    "a bare `Block: {}` returns 403, which this path already means something else by",
  );
  // Bodies must differ too: a client that reads only `error` has to be able to
  // tell them apart. 'rate_limited' is shared with the tutor edge stack on purpose.
  // Matched against the Content literal alone, not the whole block — the comment
  // above it quotes the 403 body it is contrasted with.
  const body = resource("QpuWebAcl").match(/^\s+Content: '(.*)'$/m)?.[1];
  assert.ok(body, "the 429 must carry an inline JSON body literal");
  assert.match(body, /"error":"rate_limited"/);
  assert.doesNotMatch(body, /"error":"forbidden"/);
  // And the parameter's prose must state the status operators will actually see.
  assert.match(edge, /HTTP 429/, "RateLimitPerMinute must document the status it produces");
});

test("the 429 carries the CORS header without which no browser can READ it", () => {
  // The gap this closes: a WAF block is generated at the EDGE, so the request never
  // reaches the origin and template.yaml's CorsConfiguration never runs. The site
  // (quantum.altivum.ai) is cross-origin to this distribution, and every
  // qpu-client.ts call sends an `authorization` header, so every call is a CORS
  // request. Strip Access-Control-Allow-Origin and the browser DISCARDS the 429:
  // fetch rejects with TypeError, res.status is never observed, and the whole point
  // of returning 429 instead of 403 is silently undone. Nothing at deploy time or in
  // any metric shows this — the WAF happily reports a blocked request either way.
  const acl = resource("QpuWebAcl");
  const from = acl.indexOf("CustomResponse:");
  assert.notEqual(from, -1, "the rate-limit block no longer has a CustomResponse");
  const customResponse = acl.slice(from, acl.indexOf("Statement:", from));
  assert.match(
    customResponse,
    /ResponseHeaders:\s*\n\s*- Name: Access-Control-Allow-Origin\s*\n\s*Value: !Ref SiteOrigin/,
    "the 429 must carry Access-Control-Allow-Origin, sourced from the SiteOrigin parameter",
  );
  // Not credentials-mode: qpu-client's fetch never sets credentials, it sends a
  // Bearer token in a header. Allow-Credentials would be dead weight advertising a
  // cookie contract this API does not have.
  assert.doesNotMatch(customResponse, /Access-Control-Allow-Credentials/);
});

test("the allowed origin cannot drift from the origin stack's own CORS allowlist", () => {
  // Two stacks, one allowlist. template.yaml (us-east-2) decides who may read a
  // NORMAL response; this stack decides who may read the THROTTLED one. If the two
  // disagree, the throttle goes unreadable in exactly the case it was created for,
  // and the failure is invisible until a real learner is being rate limited.
  const here = paramDefault(edge, "SiteOrigin");
  const there = paramDefault(main, "SiteOrigin");
  assert.ok(here, "edge.yaml must parameterize SiteOrigin, not hardcode an origin");
  assert.equal(here, there, "edge.yaml and template.yaml disagree on SiteOrigin");
  assert.match(here, /^https:\/\//, "the allowed origin must be https");
  // A single static header can name ONE origin, so it names production. localhost
  // (which template.yaml's CorsConfiguration does allow) deliberately cannot read a
  // throttle response; a wildcard here would hand the 429 to every site on the web.
  assert.notEqual(here, "*", "a wildcard would expose the API's responses to any origin");
});

test("CORS preflights are exempt from the rate limit, which is what makes the 429 reachable", () => {
  // A preflight must answer with an ok (2xx) status or the browser treats the whole
  // request as a network error — so a preflight blocked with 429 cannot be rescued by
  // any header, and the Access-Control-Allow-Origin above would never be seen. Since
  // CloudFront forwards OPTIONS and every qpu-client call is preflighted, the burst
  // that trips the limit would otherwise block the preflight too.
  const acl = resource("QpuWebAcl");
  const rate = acl.slice(acl.indexOf("RateBasedStatement:"));
  assert.match(rate, /ScopeDownStatement:/, "preflights must be excluded from the rate count");
  // Polarity is the whole test. Dropping `NotStatement` inverts it: the rule would
  // then count ONLY preflights and leave POST /qpu/submit — the money path — with no
  // rate limit at all, while every metric and every deploy stayed green.
  assert.match(
    rate,
    /ScopeDownStatement:\s*\n\s*NotStatement:\s*\n\s*Statement:\s*\n\s*ByteMatchStatement:/,
    "the scope-down must be a NotStatement; without it the rate limit inverts",
  );
  assert.match(rate, /FieldToMatch:\s*\n\s*Method: \{\}/, "the exemption must key on the HTTP method");
  assert.match(rate, /PositionalConstraint: EXACTLY/);
  assert.match(rate, /SearchString: OPTIONS/);
});

test("the origin injects the shared secret that makes the raw API URL unusable", () => {
  const dist = resource("QpuDistribution");
  // Without this header the WAF is bypassable: anyone with a Cognito token could
  // hit the us-east-2 API host directly and never meet a rate limit.
  assert.match(dist, /HeaderName: x-qpu-edge/);
  assert.match(
    dist,
    /HeaderValue: !Sub "\{\{resolve:secretsmanager:\$\{EdgeSecretName\}:SecretString\}\}"/,
    "the secret must resolve at deploy time, never be passed on the CLI",
  );
});

test("the managed common rule set stays in front of the API", () => {
  const acl = resource("QpuWebAcl");
  assert.match(acl, /Name: AWSManagedRulesCommonRuleSet/);
  assert.match(acl, /VendorName: AWS/);
  // Count mode would keep every metric looking identical while blocking nothing.
  assert.match(acl, /OverrideAction:\s*\n\s*None: \{\}/, "the managed group must block, not count");
});
