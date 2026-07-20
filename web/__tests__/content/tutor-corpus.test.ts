/**
 * Content-level guard on the tutor's grounding corpus: run the REAL strip over
 * the REAL curriculum GUIDEs and assert what the model is actually fed.
 *
 * The synthetic fixtures in web/__tests__/lib/tutor.test.ts and
 * lambda/tutor/tutor-core.test.mjs are the fast unit layer, but both were written
 * without the hazards the curriculum actually contains — balanced `$` pairs, no
 * underscores, no escaped `\$`, no currency — so two grounding-corruption bugs
 * shipped green for months: every intra-word underscore was deleted (the corpus
 * taught the model `circuit.statevector()`), and any line carrying two prices lost
 * both dollar signs. This test reads the seven GUIDEs the same way
 * reps-corpus.test.ts does, so a regression fails in the existing web CI job.
 *
 * These are content invariants, not shape assertions: the system prompt orders the
 * model to answer ONLY from this text and to never invent API names, prices or
 * numbers, so anything corrupted here is something the model will state confidently.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { stripGuideForTutor } from "@/lib/tutor";

const REPO_ROOT = path.join(__dirname, "../../..");

const sections = readdirSync(REPO_ROOT)
  .filter((d) => /^\d\d-/.test(d) && existsSync(path.join(REPO_ROOT, d, "GUIDE.md")))
  .sort();

/** Grounding text for a section, uncapped — invariants are about the transform, not the cap. */
function grounding(section: string): string {
  return stripGuideForTutor(readFileSync(path.join(REPO_ROOT, section, "GUIDE.md"), "utf-8"), Infinity);
}

/**
 * Source prose with fenced blocks and block math removed — the strip drops those
 * wholesale, so only what survives them can be expected in the output.
 */
function prose(section: string): string {
  return readFileSync(path.join(REPO_ROOT, section, "GUIDE.md"), "utf-8")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ");
}

it("finds the seven curriculum sections", () => {
  expect(sections.length).toBeGreaterThanOrEqual(7);
});

describe.each(sections)("%s grounding text", (section) => {
  it("is non-empty", () => {
    expect(grounding(section).length).toBeGreaterThan(1000);
  });

  it("preserves every inline-code identifier verbatim", () => {
    // API names are the one thing the prompt forbids the model to guess, so a
    // mangled identifier is worse than a missing one: it reads as authoritative.
    const out = grounding(section);
    const idents = [...prose(section).matchAll(/`([^`\n]*_[^`\n]*)`/g)].map((m) => m[1]);
    expect(idents.filter((id) => !out.includes(id))).toEqual([]);
  });

  it("never emits a stray backslash before a digit", () => {
    // `\$0.30` must become `$0.30`, not `\0.30` — the escape belongs to the
    // dollar sign, so eating the sign and keeping the backslash is pure garbage.
    expect(grounding(section).match(/\\\d/g) ?? []).toEqual([]);
  });

  it("keeps the dollar sign on every escaped currency figure", () => {
    // An escaped `\$` is unambiguously prose currency, never math.
    const out = grounding(section);
    const escaped = [...prose(section).matchAll(/\\\$(\d[\d.,]*)/g)].map((m) => m[1]);
    expect(escaped.filter((v) => !out.includes(`$${v}`))).toEqual([]);
  });

  it("leaves no link or image syntax behind", () => {
    const out = grounding(section);
    expect(out).not.toMatch(/\]\(http/);
    expect(out).not.toContain("```");
  });
});

it("keeps the per-task and per-shot prices denominated in 02-hardware", () => {
  // The costing lesson is where a de-denominated number does the most damage:
  // "0.30 plus 0.08 per shot" is a different claim from "$0.30 plus $0.08".
  const out = grounding("02-hardware");
  for (const price of ["$0.30", "$0.08", "$80.30"]) expect(out).toContain(price);
});

it("keeps the instance hourly range denominated in 06-hybrid-jobs", () => {
  const out = grounding("06-hybrid-jobs");
  for (const price of ["$0.10", "$3.85"]) expect(out).toContain(price);
});

it("keeps the Braket/PennyLane identifiers the lessons teach", () => {
  // Spot-check the names a learner is most likely to ask the tutor about, across
  // sections, so the invariant is legible and not only computed.
  expect(grounding("01-foundations")).toContain("circuit.state_vector()");
  expect(grounding("02-hardware")).toContain("AwsDevice.get_devices()");
  for (const ident of ["log_metric", "stopping_condition", "save_job_checkpoint"]) {
    expect(grounding("06-hybrid-jobs")).toContain(ident);
  }
});
