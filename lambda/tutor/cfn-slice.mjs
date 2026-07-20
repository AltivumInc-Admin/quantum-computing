/**
 * Structural slicing for CloudFormation templates, shared by template.test.mjs
 * and edge.test.mjs.
 *
 * Both templates use CloudFormation intrinsics (!Ref, !Sub, !GetAtt), which no
 * plain YAML parser loads without registering custom tags — so rather than add a
 * YAML dependency to a Lambda whose whole point is being dependency-free, the
 * tests slice the file by indentation: top-level section, then the 2-space
 * indented resource blocks inside it. Good enough to pin the handful of literal
 * values whose silent drift is invisible at runtime.
 *
 * Test-only. Not in package.json `files`, so `sam build` never packages it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Lines of one top-level section (e.g. Resources), up to the next top-level key. */
export function section(src, name) {
  const lines = src.split(/\r?\n/);
  const start = lines.indexOf(`${name}:`);
  assert.notEqual(start, -1, `template has no top-level ${name}: section`);
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

/** Map of logicalId -> body lines for every 2-space-indented block in a section. */
export function blocks(sectionLines) {
  const byId = {};
  let id = null;
  for (const line of sectionLines) {
    const m = line.match(/^  ([A-Za-z0-9]+):\s*$/);
    if (m) {
      id = m[1];
      byId[id] = [];
    } else if (id) {
      byId[id].push(line);
    }
  }
  return byId;
}

/**
 * Read a template beside this file and return its raw text plus the usual
 * per-resource accessors, so each suite is one call away from asserting.
 */
export function loadTemplate(fileName, importMetaUrl) {
  const text = readFileSync(new URL(`./${fileName}`, importMetaUrl), "utf8");
  const resources = blocks(section(text, "Resources"));
  const body = (id) => (resources[id] ?? []).join("\n");
  const typeOf = (id) => body(id).match(/^\s+Type:\s+(\S+)/m)?.[1];
  const ofType = (t) => Object.keys(resources).filter((id) => typeOf(id) === t);
  return { text, resources, body, typeOf, ofType };
}
