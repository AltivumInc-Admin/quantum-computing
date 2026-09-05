/**
 * Is the drift check's FUNCTIONS registry complete?
 *
 * FUNCTIONS is hand-maintained against the CloudFormation templates that
 * declare those names — the fourth such list in this repo, and
 * lambda/analytics/README.md records that lambda/stripe was missed in two of
 * the others for three weeks. A function added to a template but never added
 * here is simply not downloaded, and the run still prints "All N unheld
 * functions match git": a green report that silently excludes it.
 *
 * So the expected set is DERIVED here, from the templates themselves, and
 * compared to the registry in both directions. No AWS, no network — this is a
 * property of the repository.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FUNCTIONS, UNDERIVABLE, declaredFunctionNames, declaredFunctions, registryGaps } from "./rules.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The one IAM policy this repository declares, and the CI role it defines. */
const ROLE_TEMPLATE = join(REPO, "infra", "github-oidc-drift-role.yaml");

/** Every { fn, dir, handler } a lambda template declares as a literal. */
const declaredInTemplates = () => {
  const declared = [];
  for (const entry of readdirSync(join(REPO, "lambda"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const template = join(REPO, "lambda", entry.name, "template.yaml");
    if (!existsSync(template)) continue;
    for (const d of declaredFunctions(readFileSync(template, "utf8"))) {
      declared.push({ ...d, dir: `lambda/${entry.name}` });
    }
  }
  return declared;
};

test("the templates still declare function names (this guard must not no-op)", () => {
  // A regex that matches nothing would let every assertion below pass forever.
  const declared = declaredInTemplates();
  assert.ok(declared.length >= 9, `expected the templates to declare at least 9 functions, saw ${declared.length}`);
  assert.ok(declared.some((d) => d.fn === "quantum-tutor" && d.dir === "lambda/tutor"));
});

test("every function a template declares is registered for the drift check", () => {
  const { unregistered } = registryGaps(declaredInTemplates(), FUNCTIONS);
  assert.deepEqual(
    unregistered,
    [],
    "a template declares a function the drift check never downloads — add it to FUNCTIONS in scripts/drift/rules.mjs",
  );
});

test("every registered function is declared by a template, or excused with a reason", () => {
  const { underived } = registryGaps(declaredInTemplates(), FUNCTIONS);
  assert.deepEqual(
    underived,
    [],
    "FUNCTIONS names something no template declares — a typo, or a function that no longer exists",
  );
});

test("a registered function is built from the directory whose template declares it", () => {
  assert.deepEqual(registryGaps(declaredInTemplates(), FUNCTIONS).misdirected, []);
});

test("the only excused names are the parameterized stripe pair, each with a reason", () => {
  assert.deepEqual(UNDERIVABLE.map((u) => u.fn), ["quantum-stripe", "quantum-stripe-sandbox"]);
  for (const u of UNDERIVABLE) assert.ok(u.reason.length > 40, `${u.fn} needs a written reason`);
  const stripe = readFileSync(join(REPO, "lambda", "stripe", "template.yaml"), "utf8");
  // The reason has to stay true: the moment that template pins a literal name,
  // the exemption is stale and both entries belong in the derived set.
  assert.match(stripe, /FunctionName: !Ref NamePrefix/);
  assert.deepEqual(declaredFunctionNames(stripe), []);
});

test("a function present in a template but missing from the registry is caught", () => {
  const declared = [{ fn: "quantum-newthing", dir: "lambda/newthing" }];
  assert.deepEqual(registryGaps(declared, [], []).unregistered, declared);
});

test("a registered name no template declares is caught, unless excused", () => {
  const registered = [{ fn: "quantum-ghost", dir: "lambda/ghost" }];
  assert.deepEqual(registryGaps([], registered, []).underived, registered);
  assert.deepEqual(registryGaps([], registered, [{ fn: "quantum-ghost", reason: "x" }]).underived, []);
});

test("a registry entry pointing at the wrong directory is caught", () => {
  const gaps = registryGaps(
    [{ fn: "quantum-tutor", dir: "lambda/tutor" }],
    [{ fn: "quantum-tutor", dir: "lambda/sync" }],
    [],
  );
  assert.deepEqual(gaps.misdirected, [
    { fn: "quantum-tutor", declaredIn: "lambda/tutor", registeredAs: "lambda/sync" },
  ]);
});

test("a commented-out or !Ref FunctionName is not a declaration", () => {
  const template = [
    "      # function name is pinned (FunctionName: quantum-tutor), so the literal",
    "      FunctionName: !Ref NamePrefix",
    "      FunctionName: quantum-real",
  ].join("\n");
  assert.deepEqual(declaredFunctionNames(template), ["quantum-real"]);
});

test("every literal function declares an entry point for the Handler comparison", () => {
  // The deployed-vs-declared Handler check is only as good as this: a template
  // that stopped declaring one would silently take its function out of it.
  for (const d of declaredInTemplates()) {
    assert.match(d.handler ?? "", /^[\w.-]+\.handler$/, `${d.fn} declares no Handler`);
  }
});

test("a Handler is attributed to the function in its own resource block", () => {
  const template = [
    "Resources:",
    "  AlphaFunction:",
    "    Type: AWS::Serverless::Function",
    "    Properties:",
    "      FunctionName: quantum-alpha",
    "      Handler: alpha.handler",
    "  BetaFunction:",
    "    Type: AWS::Serverless::Function",
    "    Properties:",
    "      FunctionName: quantum-beta",
    "      Handler: beta.handler",
  ].join("\n");
  assert.deepEqual(declaredFunctions(template), [
    { fn: "quantum-alpha", handler: "alpha.handler" },
    { fn: "quantum-beta", handler: "beta.handler" },
  ]);
});

test("the CI role grants exactly the functions the drift check reads", () => {
  // Both Lambda reads return the function's environment in full, so this grant
  // is the blast radius of a public repository's workflow. It was a name
  // prefix across every region, which put every future quantum-* function in
  // scope; now it is a list, and a list can go stale in the other direction.
  const template = readFileSync(join(REPO, "infra", "github-oidc-drift-role.yaml"), "utf8");
  const granted = [...template.matchAll(/function:(quantum-[A-Za-z0-9-]+) *$/gm)].map((m) => m[1]);
  assert.deepEqual(granted.sort(), FUNCTIONS.map((f) => f.fn).sort());
});

test("the CI role names no ListFunctions and no wildcarded region", () => {
  // Comment lines stripped: this is an assertion about the POLICY, and the
  // policy explains in prose why the deleted grant is not coming back — the
  // word ListFunctions appears there on purpose.
  const policy = readFileSync(ROLE_TEMPLATE, "utf8")
    .split("\n")
    .filter((line) => !/^ *#/.test(line))
    .join("\n");
  assert.doesNotMatch(policy, /ListFunctions/);
  // A wildcarded region segment would reach same-named functions elsewhere.
  assert.doesNotMatch(policy, /arn:aws:lambda:\*:/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * The IAM guard, asserted over the PARSED policy rather than over line order.
 *
 * What this replaces, and why. The rule "a wildcard must be immediately
 * preceded by `Action: braket:SearchDevices`" was enforced by a positional
 * text heuristic: it inspected only lines matching /^ *Resource: *"\*" *$/ and
 * read the previous non-blank line. Its commit message claimed "a wildcard on
 * any other action still fails". That was FALSE, and not narrowly:
 *
 *   - appending one `- "*"` to the eleven-ARN lambda list — account-wide
 *     GetFunction and GetFunctionConfiguration, i.e. every environment
 *     variable of every function in the region, which is the exact blast
 *     radius the policy's own comment cites — matched no line the guard read;
 *   - `Action: braket:*`, a flow list `[braket:SearchDevices, lambda:GetFunction]`,
 *     or a block list whose LAST entry is braket:SearchDevices all satisfied
 *     the "preceding line" test while granting more than SearchDevices;
 *   - `Resource: '*'`, `Resource: [ "*" ]` and a block scalar are all the same
 *     wildcard written three ways the regex does not match;
 *   - a second statement anywhere else in the file (Outputs, say) was invisible;
 *   - and `ManagedPolicyArns: [AdministratorAccess]` was never looked at at all.
 *
 * So the assertion is now: parse the document, find EVERY statement-shaped node
 * in it, and require each one to sit at a known path AND to be one of an
 * explicitly allowed (effect, action set, resource set) triples. Action sets are
 * pinned member-for-member — `startsWith("lambda:")` would admit `lambda:*`,
 * which is UpdateFunctionCode and DeleteFunction on every production function
 * and strictly worse than the wildcard Resource this guard was written for.
 *
 * The parser is written here, by hand, over the YAML subset CloudFormation
 * templates actually use. It is not a dependency because it cannot be one:
 * .github/workflows/ci.yml runs `node --test scripts/drift/*.test.mjs` with no
 * `npm ci` and there is no package.json at the repository root, so an import
 * outside node: builtins fails at load — which `node --test` reports as a
 * failing file, but only after someone has added it.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Every place a policy statement is allowed to exist in this template. */
const STATEMENT_PATHS = [
  "Resources.DriftCheckRole.Properties.AssumeRolePolicyDocument.Statement.0",
  "Resources.DriftCheckRole.Properties.Policies.0.PolicyDocument.Statement.0",
  "Resources.DriftCheckRole.Properties.Policies.1.PolicyDocument.Statement.0",
];

/** The Braket statement is the ONE place a wildcard resource may appear. */
const WILDCARD_PATH = "Resources.DriftCheckRole.Properties.Policies.1.PolicyDocument.Statement.0";

/**
 * The parameter DEFAULTS this role deploys with, pinned here because the deploy
 * runbook at the top of the template passes no --parameter-overrides: the Default IS
 * the deployed value. Auditing the template as text never sees them, so widening a
 * default defeated both halves of this guard at once while every pinned literal stayed
 * byte-identical:
 *
 *   - FunctionRegion: "*" resolves the eleven lambda ARNs to
 *     arn:aws:lambda:*:<acct>:function:quantum-* — account-wide GetFunction and
 *     GetFunctionConfiguration, in EVERY region, which is exactly what the test named
 *     "no ListFunctions and no wildcarded region" claims to prevent and what the
 *     parameter's own Description warns about;
 *   - GitHubRepo: attacker/evil-repo resolves the trust condition to
 *     repo:attacker/evil-repo:ref:refs/heads/main — this role's credentials handed to
 *     a different repository.
 *
 * So every !Sub literal below is compared AFTER the template's own defaults are
 * substituted into it, and the defaults themselves are pinned. Changing the region or
 * the repo is then the same kind of visible diff changing a literal already is.
 */
const PARAM_DEFAULTS = {
  GitHubRepo: "AltivumInc-Admin/quantum-computing",
  GitHubRef: "refs/heads/main",
  FunctionRegion: "us-east-2",
};

/** One concrete AWS region, never a wildcard and never a prefix. */
const REGION_SEGMENT = /^[a-z]{2}-[a-z]+-\d$/;

/** The template's own shape: these keys, this one resource, nothing else. */
const TOP_LEVEL_KEYS = ["AWSTemplateFormatVersion", "Description", "Parameters", "Resources", "Outputs"];
const RESOURCE_NAMES = ["DriftCheckRole"];

/** A property CloudFormation types as `Json` — and therefore also accepts as a STRING. */
const POLICY_DOCUMENT_KEYS = ["PolicyDocument", "AssumeRolePolicyDocument"];

/** `${Param}` -> the template's declared Default. `${AWS::AccountId}` is left alone. */
function resolveParams(value, defaults) {
  return String(value).replace(/\$\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name) =>
    name in defaults ? defaults[name] : whole,
  );
}

/** Every parameter that declares a Default, as name -> default. */
function declaredDefaults(doc) {
  const out = {};
  for (const [name, spec] of Object.entries(doc?.Parameters ?? {})) {
    if (spec && typeof spec === "object" && "Default" in spec) out[name] = String(spec.Default);
  }
  return out;
}

const LAMBDA_ARN =
  /^!Sub arn:aws:lambda:([a-z]{2}-[a-z]+-\d):\$\{AWS::AccountId\}:function:(quantum-[A-Za-z0-9-]+)$/;
const OIDC_PRINCIPAL = "!Sub arn:aws:iam::${AWS::AccountId}:oidc-provider/token.actions.githubusercontent.com";
const OIDC_SUBJECT = `!Sub repo:${PARAM_DEFAULTS.GitHubRepo}:ref:${PARAM_DEFAULTS.GitHubRef}`;

/** IAM lets every one of these be a scalar or a list; normalize before comparing. */
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/**
 * The allowlist. Returns the name of the grant a statement IS, or null — and
 * null is a test failure, so every clause here is load-bearing.
 */
function classifyStatement(stmt, functionNames, defaults = PARAM_DEFAULTS) {
  if (stmt.Effect !== "Allow") return null;
  const keys = Object.keys(stmt).sort().join(",");
  const actions = asList(stmt.Action).map(String).sort();
  // Resolved against the template's OWN defaults, so what is compared is the ARN that
  // actually deploys rather than the literal `${FunctionRegion}` written in the file.
  const resources = asList(stmt.Resource).map((r) => resolveParams(r, defaults));

  if (keys === "Action,Condition,Effect,Principal") {
    // Who may assume the role. Widening either condition — or the ref — is how
    // any branch, or any GitHub tenant, would get these credentials.
    if (actions.join(",") !== "sts:AssumeRoleWithWebIdentity") return null;
    if (Object.keys(stmt.Principal ?? {}).join(",") !== "Federated") return null;
    if (stmt.Principal.Federated !== OIDC_PRINCIPAL) return null;
    if (Object.keys(stmt.Condition ?? {}).join(",") !== "StringEquals") return null;
    const eq = stmt.Condition.StringEquals ?? {};
    if (Object.keys(eq).sort().join(",") !== "token.actions.githubusercontent.com:aud,token.actions.githubusercontent.com:sub") return null;
    if (eq["token.actions.githubusercontent.com:aud"] !== "sts.amazonaws.com") return null;
    // Resolved: a repointed GitHubRepo/GitHubRef default fails here as loudly as a
    // rewritten literal would, because both produce a different deployed subject.
    if (resolveParams(eq["token.actions.githubusercontent.com:sub"], defaults) !== OIDC_SUBJECT) return null;
    return "assume-from-one-repo-at-one-ref";
  }

  if (keys !== "Action,Effect,Resource") return null;

  if (actions.join(",") === "lambda:GetFunction,lambda:GetFunctionConfiguration") {
    // Exactly the registered functions, each as a fully qualified ARN in the one
    // parameterized region. Any resource that is not such an ARN — a wildcard, a
    // wildcarded region, a name prefix — fails here rather than being counted.
    const matched = resources.map((r) => LAMBDA_ARN.exec(r));
    if (matched.some((m) => m === null)) return null;
    // The resolved region segment must be ONE region, and the region the defaults say.
    if (matched.some((m) => m[1] !== defaults.FunctionRegion)) return null;
    const named = matched.map((m) => m[2]);
    if (named.slice().sort().join(",") !== functionNames.slice().sort().join(",")) return null;
    return "read-the-registered-functions";
  }

  if (actions.join(",") === "braket:SearchDevices") {
    // SearchDevices has no resource types in the service authorization
    // reference, so "*" is the only expressible value and it reads a public
    // catalog. That is the whole of the exemption: this action, this resource.
    if (resources.length !== 1 || resources[0] !== "*") return null;
    return "list-the-public-device-catalog";
  }

  return null;
}

/** Anything carrying one of these keys is a grant, wherever in the file it sits. */
const STATEMENT_KEYS = ["Effect", "Action", "NotAction", "Resource", "NotResource"];

/**
 * Parse the template, then report every way it grants more than the two things
 * this role exists to do. Exported so the bypasses can be exercised against
 * synthetic templates without touching the real one on disk.
 */
export function auditRoleTemplate(text, functionNames) {
  let parsed;
  try {
    parsed = parseCfnYaml(text);
  } catch (err) {
    // A parse that stopped early read part of the file and audited that part. Report
    // it as a finding rather than a clean policy: the whole point of the end-of-file
    // check is that a short read is indistinguishable from a short template.
    return { doc: {}, findings: [String(err?.message ?? err)], statements: [], wildcards: [] };
  }
  const { doc, meta } = parsed;
  const findings = [];
  const statements = [];
  const wildcards = [];
  const defaults = declaredDefaults(doc);

  const lineOf = (node, key) => meta.get(node)?.keys?.get(key) ?? meta.get(node)?.line ?? 0;
  const shape = (s) =>
    `Action ${JSON.stringify(asList(s.Action))} on Resource ${JSON.stringify(asList(s.Resource))}`;

  // The template's SHAPE, pinned before anything in it is walked. A sibling
  // AWS::IAM::RolePolicy or AWS::IAM::ManagedPolicy attaching a second grant to
  // quantum-ci-drift-check is a whole new resource, and an allowlist of one is the
  // only thing that stops it in every spelling — including the spellings whose
  // PolicyDocument this parser cannot see into at all.
  const topLevel = Object.keys(doc ?? {});
  if (topLevel.join(",") !== TOP_LEVEL_KEYS.join(",")) {
    findings.push(`the template's top-level keys are [${topLevel}], not [${TOP_LEVEL_KEYS}]`);
  }
  const resourceNames = Object.keys(doc?.Resources ?? {});
  if (resourceNames.join(",") !== RESOURCE_NAMES.join(",")) {
    findings.push(
      `Resources declares [${resourceNames}], not [${RESOURCE_NAMES}] — this template ` +
        `declares exactly one role and no other IAM resource`,
    );
  }

  // Parameter defaults, which are the values that DEPLOY: the runbook at the top of
  // the template passes no --parameter-overrides.
  for (const [name, expected] of Object.entries(PARAM_DEFAULTS)) {
    if (defaults[name] !== expected) {
      findings.push(`Parameters.${name}.Default is ${JSON.stringify(defaults[name] ?? null)}, not ${JSON.stringify(expected)} — that default is what deploys`);
    }
  }
  if (!REGION_SEGMENT.test(defaults.FunctionRegion ?? "")) {
    findings.push(`Parameters.FunctionRegion.Default ${JSON.stringify(defaults.FunctionRegion ?? null)} is not one concrete region`);
  }

  for (const { path, node } of walkNodes(doc)) {
    for (const key of POLICY_DOCUMENT_KEYS) {
      // CloudFormation types both of these `Json`, and a `Json` property accepts a
      // raw STRING: a `PolicyDocument: |` block scalar or a `!Sub '{...}'` deploys
      // exactly like a mapping does. To this parser it is one opaque scalar, so no
      // node below it carries Effect/Action/Resource and the walk finds nothing to
      // object to — a grant of Action "*" on Resource "*" audited as findings=[].
      // A policy that cannot be read cannot be audited, so it is a finding.
      if (key in node && (node[key] === null || typeof node[key] !== "object")) {
        findings.push(
          `${path}.${key} (line ${lineOf(node, key)}) is a ${typeof node[key]}, not a parsed policy — ` +
            `a JSON-string policy document is invisible to this audit; write it as YAML`,
        );
      }
    }
    if ("ManagedPolicyArns" in node) {
      // An AdministratorAccess attachment grants everything while every
      // statement below still reads as tightly scoped.
      findings.push(`ManagedPolicyArns at ${path} (line ${lineOf(node, "ManagedPolicyArns")}) — this role attaches no managed policy`);
    }
    if (!STATEMENT_KEYS.some((k) => k in node)) continue;
    statements.push({ path, node });

    if (asList(node.Resource).map(String).includes("*")) {
      wildcards.push({ path, line: lineOf(node, "Resource") });
    }
    if (!STATEMENT_PATHS.includes(path)) {
      findings.push(`a grant outside the role's two inline policies, at ${path} (line ${lineOf(node, "Resource")}): ${shape(node)}`);
      continue;
    }
    if (!classifyStatement(node, functionNames, defaults)) {
      findings.push(`${path} (line ${lineOf(node, "Resource")}) is not one of the pinned grants: ${shape(node)}`);
    }
  }

  for (const path of STATEMENT_PATHS) {
    if (!statements.some((s) => s.path === path)) findings.push(`no statement at ${path} — the template stopped granting something this guard pins`);
  }
  for (const { path, line } of wildcards) {
    if (path !== WILDCARD_PATH) findings.push(`Resource "*" on line ${line}, at ${path}, is not the Braket device listing`);
  }

  return { doc, findings, statements, wildcards };
}

/** Depth-first over every mapping node, carrying its dotted path. */
function* walkNodes(node, path = []) {
  if (Array.isArray(node)) {
    for (let k = 0; k < node.length; k++) yield* walkNodes(node[k], [...path, k]);
  } else if (node && typeof node === "object") {
    yield { path: path.join("."), node };
    for (const [k, v] of Object.entries(node)) yield* walkNodes(v, [...path, k]);
  }
}

/**
 * The YAML subset CloudFormation templates use: block mappings and sequences,
 * flow mappings and sequences, quoted and plain scalars, `>`/`|` block scalars,
 * comments, and short-form tags (`!Sub`, `!Ref`, `!GetAtt`), which are kept as
 * their raw text so a policy can be compared against the literal it declares.
 *
 * Returns the document plus a WeakMap of node -> { line, keys }, both TRUE file
 * lines: the old guard indexed a comment-stripped array, which reported the
 * Braket wildcard 83 lines off its actual position.
 *
 * IT FAILS CLOSED, and that is the load-bearing property, not the subset it covers.
 * parseMap() breaks on any line it cannot split into key/value and parseSeq() breaks
 * on any indent change, so a construct outside the subset does not raise — it ENDS
 * the document, silently, and everything below becomes invisible to walkNodes. That
 * is not theoretical: a legal multi-line flow mapping in Resources,
 *
 *     Decoy: {
 *       Type: AWS::CloudFormation::WaitConditionHandle
 *     }
 *
 * placed after DriftCheckRole made the parser abandon the rest of the Resources map.
 * An ordinary-YAML AWS::IAM::RolePolicy below it — Action "*" on Resource "*",
 * attached to quantum-ci-drift-check — was then read by nobody and the audit returned
 * findings=[]. The identical policy WITHOUT the decoy is caught, so the decoy alone
 * disarmed the guard; and all three pinned statements still parsed, so the
 * "no statement at <path>" backstop did not fire either.
 *
 * So the parse is only accepted if it reached the end of the file. A desync throws
 * with the line it stopped on, and auditRoleTemplate turns that into a finding.
 */
export function parseCfnYaml(text) {
  const lines = text.split("\n");
  const meta = new WeakMap();
  let i = 0;

  const indentOf = (raw) => raw.length - raw.replace(/^ +/, "").length;
  const skippable = (raw) => raw.trim() === "" || /^ *#/.test(raw);
  const skip = () => {
    while (i < lines.length && skippable(lines[i])) i++;
  };

  /** A `#` starts a comment only outside quotes and only after whitespace. */
  function stripComment(s) {
    let out = "";
    let quote = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (quote) {
        out += c;
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        out += c;
        continue;
      }
      if (c === "#" && (k === 0 || /\s/.test(s[k - 1]))) break;
      out += c;
    }
    return out.replace(/\s+$/, "");
  }

  /** The first `:` followed by whitespace or end of line, outside quotes. */
  function splitKey(s) {
    let quote = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === ":" && (k + 1 >= s.length || /\s/.test(s[k + 1]))) return [s.slice(0, k), s.slice(k + 1)];
    }
    return null;
  }

  function splitFlow(inner) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let cur = "";
    for (const c of inner) {
      if (quote) {
        cur += c;
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
      else if (c === "," && depth === 0) {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    if (cur.trim() !== "") parts.push(cur);
    return parts;
  }

  function parseScalar(s) {
    const t = s.trim();
    if (t === "" || t === "null" || t === "~") return null;
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\(.)/g, "$1");
    if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t.startsWith("[") && t.endsWith("]")) return splitFlow(t.slice(1, -1)).map(parseScalar);
    if (t.startsWith("{") && t.endsWith("}")) {
      const o = {};
      for (const p of splitFlow(t.slice(1, -1))) {
        const kv = splitKey(p.trim());
        if (kv) o[parseScalar(kv[0])] = parseScalar(kv[1]);
      }
      return o;
    }
    return t; // plain scalar, including `!Sub …` kept verbatim
  }

  /** Everything indented past the key, as one string. Comments are content here. */
  function readBlockScalar(keyIndent) {
    const buf = [];
    while (i < lines.length) {
      const raw = lines[i];
      if (raw.trim() === "") {
        buf.push("");
        i++;
        continue;
      }
      if (indentOf(raw) <= keyIndent) break;
      buf.push(raw.trim());
      i++;
    }
    while (buf.length && buf[buf.length - 1] === "") buf.pop();
    return buf.join("\n");
  }

  function parseNode(minIndent) {
    skip();
    if (i >= lines.length) return null;
    const ind = indentOf(lines[i]);
    if (ind < minIndent) return null;
    return /^ *-( |$)/.test(lines[i]) ? parseSeq(ind) : parseMap(ind);
  }

  function parseMap(indent) {
    const map = {};
    const keys = new Map();
    meta.set(map, { line: i + 1, keys });
    for (;;) {
      skip();
      if (i >= lines.length) break;
      if (indentOf(lines[i]) !== indent) break;
      const body = stripComment(lines[i]).slice(indent);
      if (body === "") {
        i++;
        continue;
      }
      if (body.startsWith("-")) break;
      const kv = splitKey(body);
      if (!kv) break;
      const key = String(parseScalar(kv[0]));
      const rest = kv[1].trim();
      keys.set(key, i + 1);
      i++;
      if (/^[|>][-+]?\d*$/.test(rest)) map[key] = readBlockScalar(indent);
      else if (rest === "") map[key] = parseNode(indent + 1);
      else map[key] = parseScalar(rest);
    }
    return map;
  }

  function parseSeq(indent) {
    const arr = [];
    meta.set(arr, { line: i + 1, keys: new Map() });
    for (;;) {
      skip();
      if (i >= lines.length) break;
      const raw = lines[i];
      if (indentOf(raw) !== indent) break;
      const dash = raw.match(/^ *-( +| *$)/);
      if (!dash) break;
      const col = dash[0].length;
      const rest = stripComment(raw).slice(col).trim();
      if (rest === "") {
        i++;
        arr.push(parseNode(indent + 1));
        continue;
      }
      if (/^[[{"']/.test(rest) || !splitKey(rest)) {
        arr.push(parseScalar(rest));
        i++;
        continue;
      }
      // `- Key: value` — a mapping whose first key sits where the dash was.
      // Rewriting the dash as spaces keeps the physical line index, so every
      // line number this parser reports stays a true file line.
      lines[i] = " ".repeat(col) + rest;
      arr.push(parseNode(col));
    }
    return arr;
  }

  const doc = parseNode(0) ?? {};
  // Everything after a desync is invisible, so a short read is a parse ERROR rather
  // than a short document. Trailing blank lines and comments are not content.
  skip();
  if (i < lines.length) {
    throw new Error(
      `the template did not parse to completion: stopped at line ${i + 1} of ${lines.length} ` +
        `(${lines[i].trim()}). Everything below that line was read by nobody, so no ` +
        `statement in it could be audited.`,
    );
  }
  return { doc, meta };
}

const ROLE_NAMES = () => FUNCTIONS.map((f) => f.fn);
const roleTemplateText = () => readFileSync(ROLE_TEMPLATE, "utf8");

test("the parser reads the real template (this guard must not no-op)", () => {
  // Every assertion below is worthless if the parse came back empty, so prove
  // the shape first: a parser that silently returned {} would find no statement
  // to object to and report a perfectly clean policy forever.
  const { doc } = parseCfnYaml(roleTemplateText());
  const props = doc?.Resources?.DriftCheckRole?.Properties;
  // The document's own SHAPE, so an added or dropped resource is a failure whether or
  // not the walk ever reached it. A parser desync used to truncate the document
  // silently, and a resource below the truncation point was audited by nobody.
  assert.deepEqual(Object.keys(doc), TOP_LEVEL_KEYS);
  assert.deepEqual(Object.keys(doc.Resources), RESOURCE_NAMES);
  assert.equal(doc.Resources.DriftCheckRole.Type, "AWS::IAM::Role");
  assert.equal(props.RoleName, "quantum-ci-drift-check");
  // Raising this to 43200 is a credential-LIFETIME widening no statement check sees:
  // drift.yml's role-duration-seconds could then request a 12-hour credential for a
  // job that runs about a minute. The template's own comment treats 3600 (the IAM
  // minimum) as load-bearing, so it is pinned rather than merely commented.
  assert.equal(props.MaxSessionDuration, "3600"); // scalars are kept as their raw text
  // The deployed values: this template is deployed with no --parameter-overrides.
  assert.equal(doc.Parameters.FunctionRegion.Default, "us-east-2");
  assert.match(doc.Parameters.FunctionRegion.Default, REGION_SEGMENT);
  assert.equal(doc.Parameters.GitHubRepo.Default, "AltivumInc-Admin/quantum-computing");
  assert.equal(doc.Parameters.GitHubRef.Default, "refs/heads/main");
  assert.equal(props.Policies.length, 2);
  assert.deepEqual(props.Policies.map((p) => p.PolicyName), ["read-lambda-code-only", "list-braket-devices-only"]);
  assert.equal(props.Policies[0].PolicyDocument.Statement[0].Resource.length, FUNCTIONS.length);
  assert.equal(props.Policies[1].PolicyDocument.Statement[0].Resource, "*");
  // The prose above the template says `Resource: "*"` and `lambda:GetFunction`
  // in several comments; none of it may become a grant.
  assert.equal([...walkNodes(doc)].filter(({ node }) => STATEMENT_KEYS.some((k) => k in node)).length, 3);
});

test("every grant in the CI role template is one of the pinned statements", () => {
  const { findings } = auditRoleTemplate(roleTemplateText(), ROLE_NAMES());
  assert.deepEqual(findings, []);
});

test("the one wildcard resource is Braket's, reported at its TRUE file line", () => {
  // The old guard indexed a comment-stripped array and reported this wildcard
  // as line 79 when it lives at 162 — an operator reading the failure would
  // have opened the file at a Parameters description.
  const text = roleTemplateText();
  const { wildcards } = auditRoleTemplate(text, ROLE_NAMES());
  assert.equal(wildcards.length, 1);
  assert.equal(wildcards[0].path, WILDCARD_PATH);
  const raw = text.split("\n");
  const trueLine = raw.findIndex((l) => /^ *Resource: *"\*" *$/.test(l)) + 1;
  assert.ok(trueLine > 0, "the template no longer contains the wildcard this test locates");
  assert.equal(wildcards[0].line, trueLine);
});

test("the CI role attaches no managed policy", () => {
  const { doc } = parseCfnYaml(roleTemplateText());
  assert.ok(!("ManagedPolicyArns" in doc.Resources.DriftCheckRole.Properties));
  const attached = auditRoleTemplate(
    roleTemplateText().replace(/( *)RoleName: quantum-ci-drift-check\n/, "$1RoleName: quantum-ci-drift-check\n$1ManagedPolicyArns:\n$1  - arn:aws:iam::aws:policy/AdministratorAccess\n"),
    ROLE_NAMES(),
  );
  assert.ok(attached.findings.some((f) => f.includes("ManagedPolicyArns")), "an AdministratorAccess attachment was accepted");
});

test("the widenings that defeated the positional guard are all rejected", () => {
  // Each entry is a real bypass of the line-order heuristic this replaced: all
  // of them passed it. A mutation that failed to apply produces no finding and
  // fails here too, so a stale regex cannot quietly retire a case.
  const base = roleTemplateText();
  const bypasses = [
    [
      "a bare wildcard appended to the eleven lambda ARNs",
      (t) => t.replace(/( *)(- !Sub arn:aws:lambda:[^\n]*quantum-review-email-unsubscribe\n)/, '$1$2$1- "*"\n'),
    ],
    ["braket:* in place of braket:SearchDevices", (t) => t.replace("Action: braket:SearchDevices", "Action: braket:*")],
    [
      "a flow-style action list carrying lambda:GetFunction alongside it",
      (t) => t.replace("Action: braket:SearchDevices", "Action: [braket:SearchDevices, lambda:GetFunction]"),
    ],
    [
      "a block action list whose LAST entry is braket:SearchDevices",
      (t) => t.replace(/( *)Action: braket:SearchDevices\n/, "$1Action:\n$1  - lambda:GetFunction\n$1  - braket:SearchDevices\n"),
    ],
    [
      "a single-quoted wildcard on the lambda reads",
      (t) => t.replace(/\n( *)Resource:\n(?:\1  - !Sub[^\n]*\n)+/, "\n$1Resource: '*'\n"),
    ],
    [
      "a flow-sequence wildcard on the lambda reads",
      (t) => t.replace(/\n( *)Resource:\n(?:\1  - !Sub[^\n]*\n)+/, '\n$1Resource: [ "*" ]\n'),
    ],
    [
      "a block-scalar wildcard on the lambda reads",
      (t) => t.replace(/\n( *)Resource:\n(?:\1  - !Sub[^\n]*\n)+/, "\n$1Resource: >\n$1  *\n"),
    ],
    [
      "lambda:* on the eleven correctly scoped ARNs",
      (t) => t.replace(/( *)- lambda:GetFunction\n *- lambda:GetFunctionConfiguration\n/, "$1- lambda:*\n"),
    ],
    [
      "a twelfth function smuggled into the grant",
      (t) => t.replace(/( *)(- !Sub arn:aws:lambda:)([^\n]*)(quantum-review-email-unsubscribe\n)/, "$1$2$3$4$1$2$3quantum-ledger-admin\n"),
    ],
    [
      "a wildcarded region on the lambda reads",
      (t) => t.replace(/\$\{FunctionRegion\}/g, "*"),
    ],
    [
      "a second grant hidden under Outputs",
      (t) => `${t}  BackDoor:\n    Effect: Allow\n    Action: braket:SearchDevices\n    Resource: "*"\n`,
    ],
    [
      "a third inline policy appended to the role",
      (t) =>
        t.replace(
          /( *)- PolicyName: list-braket-devices-only\n/,
          '$1- PolicyName: extra\n$1  PolicyDocument:\n$1    Version: "2012-10-17"\n$1    Statement:\n$1      - Effect: Allow\n$1        Action: dynamodb:Scan\n$1        Resource: "*"\n$1- PolicyName: list-braket-devices-only\n',
        ),
    ],
    [
      "a trust policy widened to every branch",
      (t) => t.replace("token.actions.githubusercontent.com:sub: !Sub repo:${GitHubRepo}:ref:${GitHubRef}", "token.actions.githubusercontent.com:sub: !Sub repo:${GitHubRepo}:*"),
    ],

    /* The second round, each one measured as a working bypass of the PARSED guard
     * above before it was closed. Every one of them deploys: CloudFormation types
     * PolicyDocument as `Json`, which accepts a raw string, and a sibling IAM
     * resource is an ordinary resource. */

    [
      "a third inline policy whose PolicyDocument is a JSON block scalar",
      // Appended AFTER the two pinned policies on purpose: Policies.0 and Policies.1
      // stay exactly where STATEMENT_PATHS expects them, so the index check that
      // caught an INSERTED policy never fires. The document is one opaque scalar, so
      // the walk sees no Effect/Action/Resource at all.
      (t) =>
        t.replace(
          /\nOutputs:\n/,
          "\n        - PolicyName: extra\n" +
            "          PolicyDocument: |\n" +
            '            {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}\n' +
            "\nOutputs:\n",
        ),
    ],
    [
      "a third inline policy whose PolicyDocument is a !Sub JSON string",
      (t) =>
        t.replace(
          /\nOutputs:\n/,
          "\n        - PolicyName: extra\n" +
            `          PolicyDocument: !Sub '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["iam:*","lambda:*"],"Resource":"*"}]}'\n` +
            "\nOutputs:\n",
        ),
    ],
    [
      "a sibling AWS::IAM::RolePolicy naming the role, with a JSON-string document",
      (t) =>
        t.replace(
          /\nOutputs:\n/,
          "\n  BackdoorRolePolicy:\n" +
            "    Type: AWS::IAM::RolePolicy\n" +
            "    Properties:\n" +
            "      PolicyName: backdoor\n" +
            "      RoleName: quantum-ci-drift-check\n" +
            `      PolicyDocument: !Sub '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}'\n` +
            "\nOutputs:\n",
        ),
    ],
    [
      "a sibling AWS::IAM::ManagedPolicy attached to the role",
      (t) =>
        t.replace(
          /\nOutputs:\n/,
          "\n  ExtraManagedPolicy:\n" +
            "    Type: AWS::IAM::ManagedPolicy\n" +
            "    Properties:\n" +
            "      Roles:\n" +
            "        - !Ref DriftCheckRole\n" +
            "      PolicyDocument:\n" +
            '        Version: "2012-10-17"\n' +
            "        Statement:\n" +
            "          - Effect: Allow\n" +
            '            Action: "*"\n' +
            '            Resource: "*"\n' +
            "\nOutputs:\n",
        ),
    ],
    [
      "a multi-line flow mapping that desyncs the parser, hiding a backdoor policy below it",
      // The decoy is legal YAML this parser does not cover, and coverage was never the
      // property that mattered: parseMap() used to BREAK on it and abandon the rest of
      // Resources, so the ordinary-YAML RolePolicy underneath was read by nobody.
      // Measured: the hand parser saw ["DriftCheckRole","Decoy"] where PyYAML saw
      // ["DriftCheckRole","Decoy","BackdoorRolePolicy"].
      (t) =>
        t.replace(
          /\nOutputs:\n/,
          "\n  Decoy: {\n" +
            "    Type: AWS::CloudFormation::WaitConditionHandle\n" +
            "  }\n" +
            "  BackdoorRolePolicy:\n" +
            "    Type: AWS::IAM::RolePolicy\n" +
            "    Properties:\n" +
            "      PolicyName: backdoor\n" +
            "      RoleName: quantum-ci-drift-check\n" +
            "      PolicyDocument:\n" +
            '        Version: "2012-10-17"\n' +
            "        Statement:\n" +
            "          - Effect: Allow\n" +
            '            Action: "*"\n' +
            '            Resource: "*"\n' +
            "\nOutputs:\n",
        ),
    ],
    [
      "the FunctionRegion default widened to a wildcard, with every literal untouched",
      // Resolves the eleven ARNs to arn:aws:lambda:*:<acct>:function:quantum-* — the
      // deploy runbook in this template's header passes no --parameter-overrides, so
      // the Default is what deploys. The sibling text assertion never sees it either.
      (t) => t.replace("    Default: us-east-2\n", '    Default: "*"\n'),
    ],
    [
      "the GitHubRepo default repointed at another repository",
      (t) => t.replace("    Default: AltivumInc-Admin/quantum-computing\n", "    Default: attacker/evil-repo\n"),
    ],
    [
      "the GitHubRef default widened to every branch",
      (t) => t.replace("    Default: refs/heads/main\n", "    Default: refs/heads/*\n"),
    ],
  ];

  for (const [name, mutate] of bypasses) {
    const mutated = mutate(base);
    assert.notEqual(mutated, base, `the mutation for "${name}" no longer applies — fix the fixture, do not delete the case`);
    const { findings } = auditRoleTemplate(mutated, ROLE_NAMES());
    assert.ok(findings.length > 0, `the guard ACCEPTED a widened policy: ${name}`);
  }
});

test("a repointed parameter DEFAULT is named, and the ARN it resolves to is audited", () => {
  // Two independent failures per mutation, deliberately: the default is pinned by
  // value, AND every !Sub literal is compared after the template's own defaults are
  // substituted in. Auditing the template as text saw neither — both mutations below
  // leave every pinned literal byte-identical, and the sibling text assertion
  // /arn:aws:lambda:\*:/ never sees a resolved ARN.
  const region = auditRoleTemplate(roleTemplateText().replace("    Default: us-east-2\n", '    Default: "*"\n'), ROLE_NAMES());
  assert.ok(
    region.findings.some((f) => /Parameters\.FunctionRegion\.Default is "\*"/.test(f)),
    "a wildcarded region default was not named",
  );
  assert.ok(
    region.findings.some((f) => /Policies\.0\.PolicyDocument\.Statement\.0 .*is not one of the pinned grants/.test(f)),
    "the eleven ARNs resolve to arn:aws:lambda:*:<acct>:function:quantum-* and must fail the allowlist",
  );

  const repo = auditRoleTemplate(
    roleTemplateText().replace("    Default: AltivumInc-Admin/quantum-computing\n", "    Default: attacker/evil-repo\n"),
    ROLE_NAMES(),
  );
  assert.ok(repo.findings.some((f) => /Parameters\.GitHubRepo\.Default/.test(f)), "a repointed repo default was not named");
  assert.ok(
    repo.findings.some((f) => /AssumeRolePolicyDocument\.Statement\.0 .*is not one of the pinned grants/.test(f)),
    "the trust condition resolves to repo:attacker/evil-repo:ref:refs/heads/main and must fail the allowlist",
  );
});

test("a second IAM resource is a finding even when its own grant is unreadable", () => {
  // The allowlist of one is what stops a sibling AWS::IAM::RolePolicy or
  // AWS::IAM::ManagedPolicy in EVERY spelling — including the spellings whose
  // PolicyDocument is a string this parser cannot see into.
  const { findings } = auditRoleTemplate(
    roleTemplateText().replace(
      /\nOutputs:\n/,
      "\n  BackdoorRolePolicy:\n" +
        "    Type: AWS::IAM::RolePolicy\n" +
        "    Properties:\n" +
        "      PolicyName: backdoor\n" +
        "      RoleName: quantum-ci-drift-check\n" +
        `      PolicyDocument: !Sub '{"Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}'\n` +
        "\nOutputs:\n",
    ),
    ROLE_NAMES(),
  );
  assert.ok(
    findings.some((f) => /Resources declares \[DriftCheckRole,BackdoorRolePolicy\]/.test(f)),
    `a sibling IAM resource was accepted: ${JSON.stringify(findings)}`,
  );
});

test("the parser FAILS CLOSED: a document it could not finish reading is an error", () => {
  // The property that matters is not which YAML subset it covers — it is what happens
  // at the edge of that subset. parseMap() breaks on a line it cannot split and
  // parseSeq() breaks on an indent change, so an unsupported construct used to END the
  // document rather than raise, and every resource below it became invisible.
  assert.throws(
    () =>
      parseCfnYaml(
        ["Resources:", "  A:", "    Type: X", "  Decoy: {", "    Type: Y", "  }", "  B:", "    Type: Z"].join("\n"),
      ),
    /did not parse to completion: stopped at line 5 of 8/,
  );
  // Trailing blank lines and comments are not content, so a normal file still parses.
  const { doc } = parseCfnYaml("Resources:\n  A:\n    Type: X\n\n# a closing note\n\n");
  assert.deepEqual(doc, { Resources: { A: { Type: "X" } } });
  // And the failure reaches a caller as a finding, never as a clean audit.
  const broken = auditRoleTemplate("Resources:\n  A: {\n    Type: X\n  }\n", ROLE_NAMES());
  assert.equal(broken.findings.length, 1);
  assert.match(broken.findings[0], /did not parse to completion/);
});

test("a policy document written as a STRING is a finding, not an empty audit", () => {
  // CloudFormation types PolicyDocument and AssumeRolePolicyDocument as `Json`, and a
  // `Json` property accepts a raw string (Pattern [\t\n\r -ÿ]+, Maximum 131072): "for
  // CloudFormation templates formatted in YAML, you can provide the policy in JSON or
  // YAML format". So `PolicyDocument: |` and `PolicyDocument: !Sub '{...}'` both
  // deploy — and to this parser they are one opaque scalar carrying no Effect, Action
  // or Resource for the walk to find. An unreadable policy is not a clean policy.
  const { findings } = auditRoleTemplate(
    [
      "Resources:",
      "  DriftCheckRole:",
      "    Type: AWS::IAM::Role",
      "    Properties:",
      "      AssumeRolePolicyDocument: |",
      '        {"Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}',
    ].join("\n"),
    ROLE_NAMES(),
  );
  assert.ok(
    findings.some((f) => /AssumeRolePolicyDocument .*is a string, not a parsed policy/.test(f)),
    `a JSON-string policy document was accepted: ${JSON.stringify(findings)}`,
  );
});

test("the parser handles the YAML forms a policy can be written in", () => {
  // The bypass fixtures above are only evidence if these forms parse to the
  // same value; otherwise a case could "fail" because the parse broke.
  const { doc } = parseCfnYaml(
    [
      "Root:",
      "  quoted: '*'",
      '  flow: [ "*", a ]',
      "  block: >",
      "    *",
      '  map: { Effect: Allow, Resource: "*" }',
      "  list:",
      "    - lambda:GetFunction  # a trailing comment is not a value",
      "    - !Sub arn:aws:lambda:${R}:${AWS::AccountId}:function:q",
      "  nested:",
      "    - Effect: Allow",
      "      Action:",
      "        - a:B",
      "        - c:D",
    ].join("\n"),
  );
  assert.equal(doc.Root.quoted, "*");
  assert.deepEqual(doc.Root.flow, ["*", "a"]);
  assert.equal(doc.Root.block, "*");
  assert.deepEqual(doc.Root.map, { Effect: "Allow", Resource: "*" });
  assert.deepEqual(doc.Root.list, ["lambda:GetFunction", "!Sub arn:aws:lambda:${R}:${AWS::AccountId}:function:q"]);
  assert.deepEqual(doc.Root.nested, [{ Effect: "Allow", Action: ["a:B", "c:D"] }]);
});
