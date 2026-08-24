# design-sync notes — quantum-ds

This repo is a **Next.js app** (`web/`), not a packaged design system. There is
no Storybook and no compiled component `dist/`. The sync targets a **scoped
design-system layer** (~18 presentational primitives) via the package shape in
**synth-entry mode**, with custom staging. Keep this file current — re-syncs
depend on it.

## Setup (how the build is wired)

- **PKG_DIR = `.ds-sync/pkg/`** — chosen because `package-build.mjs` derives
  PKG_DIR by walking up from the `--entry` file to the first `package.json`
  with a `name`. The barrel lives at `.ds-sync/pkg/entry.jsx` and
  `.ds-sync/pkg/package.json` is `{"name":"quantum-ds"}`. **Gotcha:** if the
  entry sat directly in `.ds-sync/`, PKG_DIR would resolve to `.ds-sync/`
  (whose `package.json` is the converter-deps stub `ds-sync-deps`), breaking
  all cfg-relative paths (cssEntry/srcDir/componentSrcMap). Keep the barrel in
  `pkg/`.
- **`--node-modules .ds-sync/pkg/node_modules`** is a symlink to
  `web/node_modules` (so react/react-dom vendor + fallback resolution work).
  Real component deps resolve via esbuild walk-up from `web/src` regardless.
- **Next.js shims**: `next/link`, `next/navigation`, `next-themes` are mapped
  to `.ds-sync/shims/*.tsx` via the custom `.ds-sync/tsconfig.json` `paths`
  (the converter's tsconfig-paths esbuild plugin intercepts them before node
  resolution). This is why the bundle is 45 KB with **0 inlined npm packages** —
  real Next.js never enters the bundle. `@/*` also maps to `web/src` there.
  The shims are self-sufficient (context-free `useRouter`/`useTheme`), so **no
  `cfg.provider` is needed**.
- **CSS/tokens/fonts**: `cfg.cssEntry = assets/chunks/ds-styles.css` is the two
  compiled Tailwind chunks from `web/out` concatenated + a `:root` block that
  lifts the next/font `--font-jakarta`/`--font-instrument` vars (normally set on
  the `<html>` hash class) so previews get the brand fonts. Self-hosted woff2 in
  `assets/media/` resolve via the chunks' own `../media/` urls. Regenerate both
  after any `web` rebuild (see re-sync below).
- **Component list**: pinned by `cfg.componentSrcMap` (18 names → `web/src`
  paths). The barrel re-exports exactly those. `srcDir = ../../web/src` supplies
  per-component src enrichment (group + JSDoc).

## Build / verify commands (from repo root)

```
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules .ds-sync/pkg/node_modules --entry ./.ds-sync/pkg/entry.jsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

Playwright is installed in `.ds-sync/node_modules` (1.61.0, chromium rev 1228)
to match the repo's own playwright pin.

## Preview authoring conventions (calibrated on the solo set)

- Previews import from `"quantum-ds"` → mapped to `window.QuantumDS`.
- `Complex = [re, im]` tuples; state vectors are `Complex[]` of length 2^n.
- `ParsedGate = { gate, target, control?, theta?, bound? }`.
- Components do not self-pad; wrap cells in a `padding: 16–20` div.
- Pass `className=""` to `WidgetCard`/`ErrorCard` to drop the default `my-6`
  margin inside a card cell.
- Accent token is gold (`--accent` #C2A379 dark / #A38560 light — "The
  Instrument, after dark"); brand fonts are Sora (display, weights 300/400
  only) + Geist (sans), Geist Mono for bra-ket/data.

## Upload gotchas

- **Tilde (`~`) in filenames is a RESERVED path char for the DesignSync upload
  API** — `write_files` rejects any path containing `~` with a misleading
  "reserved (CLAUDE.md or .claude/)" 403. next/font and KaTeX hash their woff2
  names with `~`, so after regenerating `ds-styles.css`/media you MUST run the
  tilde sanitizer before building: rename `.ds-sync/pkg/assets/media/*` replacing
  `[^A-Za-z0-9._-]` (notably `~`) with `-`, and rewrite the matching
  `url(../media/...)` refs in `ds-styles.css`. (Double-dot `..` and `_` in names
  are fine; only `~` was rejected.) The build then copies clean names into
  `fonts/`. If the upload 403s on "reserved paths", grep `ds-bundle/fonts` for
  `~` — that's the cause.

## Scope decisions

- **LiveStatus is EXCLUDED** from the sync (was in the initial 18 → now 17). It
  renders only `<p class="sr-only" role="status" aria-live="polite">` — a
  visually-invisible screen-reader live region, not a presentational primitive.
  It captured as a blank card and cannot be graded on a visual rubric without
  stripping `sr-only` (a prohibited misrepresentation). Removed from
  `componentSrcMap` and the barrel. Do not re-add it to a *visual* gallery.

## Known render warns (legitimate — do not re-chase on re-sync)

- **EyebrowLabel** `as="span"` vs `as="h3"` render visually identical (same
  className; the axis is semantic-only). "variants render identically" here is
  expected.
- **CodeBlock** language chip + copy/wrap controls use
  `can-hover:opacity-0 … group-hover:opacity-100`, so they are hidden at rest on
  a hover-capable capture. Correct DS behavior, not a missing render.
- **ThemeToggle** captures as `[RENDER_THIN]` — it is a genuinely tiny 44x44
  icon button (a moon glyph). Legitimate, not a defect.
- **CopyButton** is icon-only at rest (`label` is aria-only); cells differing
  only by `label`/`getText` look identical — differentiate visibly via
  `className` BACKGROUND utilities (`bg-accent/10`, dark chip), never by trying
  to override the resting text color (utility collision resolved by stylesheet
  order, not class order).

## Authoring cribsheet (per-component, from the first sync)

- **CodeBlock**: previews have no rehype-highlight pipeline — pass
  `children={<code>{src}</code>}` and the same string as the raw/copy text.
- **LabeledSlider**: controlled — `React.useState` per cell; integer sliders pass
  `parse={(r) => parseInt(r, 10)}`; `valueWidth="w-20"` widens the readout.
- **GateChips** renders a bare fragment — wrap in a flex/wrap div or pills
  collapse with no gap. Labels are pre-formatted strings ("H q0", "CNOT 0->1").
- **SectionCard** takes individual props `{slug,index,title,summary,
  notebookCount}` (NOT a `section` object); `summary` is async
  (`getContentSummary`, not bundle-safe) so it's hand-written; everything else
  from `getSections()` (synchronous, from `@/lib/manifest`).
- **SectionGateModal** wants a `GateSection` `{slug,index,title,notebookCount,
  runnableCount,pitch}`; `pitch` via `pitchFor()` from `@/lib/section-pitch`
  (synchronous). Its `createPortal(document.body)` overlay captured cleanly — no
  `cardMode` override was needed (if a future run comes back blank, apply
  `cfg.overrides.SectionGateModal:{cardMode:"single",viewport:"640x480"}`).
- **CategoryChip** takes `{section: SectionSlug}` (string literal like
  `"01-foundations"`); it derives its own hue/label.

## Instrument re-sync (2026-07-18)

The web app was migrated to the **"Instrument"** design system (olive-on-smoke,
glass surfaces, Sora/Geist/Geist-Mono, tan→olive data bars, neutral CTAs) and the
mirror was re-synced. Notes for next time:
- The regen step above now emits Sora/Geist/Geist-Mono font vars (not
  Jakarta/Instrument). The `:root` lift block sets `--font-sora`/`--font-geist`/
  `--font-geist-mono`.
- A font-set change (different next/font families) leaves the OLD woff2 as remote
  ORPHANS — the reconciliation must delete remote `fonts/*` not in the new build.
  The driver's `deletePaths` only tracks component removals, so font orphans must
  be caught by the manual `list_files` diff (6 old Jakarta/Instrument fonts were
  deleted this run).
- The project also holds non-sync files the design agent/user added
  (`design_handoff_*/`, `uploads/`, root `Quantum Learner - Instrument.html`) and
  app-generated files (`_ds_manifest.json`, `_adherence.oxlintrc.json`). Leave
  all of these — they are outside the sync's write/delete scope.
- **README token-harvest item**: the `[TOKENS_MISSING]` scan in
  `package-validate.mjs` is validate-INTERNAL (referenced-minus-defined `var()`
  scan) — there is **no `cfg` knob** to exclude `--tw-*`/`--ease-*`/`--animate-*`
  prefixes. In this build it is below-threshold (1 missing), so no noise. If it
  ever fires loudly, the fix is an upstream enhancement to the design-sync
  skill's validate script, not a repo config change.

## Re-sync risks (watch-list)

- **`web/out` staleness**: `cfg.cssEntry` is baked from a specific `web` build.
  Re-run `cd web && npm run build`, then regenerate
  `.ds-sync/pkg/assets/chunks/ds-styles.css` (concat the two
  `web/out/_next/static/chunks/*.css` + the `:root` font-var block) and re-copy
  `web/out/_next/static/media/*.woff2` into `.ds-sync/pkg/assets/media/`. The
  compiled CSS chunk hashes change per build — do not hard-code the filenames;
  pick the largest app CSS chunk + the one defining `--font-jakarta`.
- **Compiled-CSS coupling**: the DS `styles.css` is the whole app stylesheet
  (all Tailwind utilities + KaTeX + hljs). 20 dead KaTeX @font-face blocks are
  dropped at build; that's expected, not a fault.
- **Shim drift**: if a scoped component starts importing a new `next/*` subpath,
  add a shim + a `paths` entry in `.ds-sync/tsconfig.json`.
- **Groups** are derived from `web/src` dir (quantum / glossary / general).
  Refine with `cfg.docsMap` stubs (`---\ncategory: <Group>\n---`) if needed.
- **`.ds-sync/` is gitignored** (machine state). The durable inputs are under
  `.design-sync/` (config.json, NOTES.md, previews/, conventions.md). A fresh
  clone must re-stage `.ds-sync/` (cp the skill scripts), recreate the
  node_modules symlink, reinstall converter deps, and rebuild `web`.

## After-dark re-sync (2026-08-23)

- The product re-themed to **"The Instrument, after dark"**: racing green /
  gold / oxblood / abyss / silver, the |Q⟩ dial-Q mark (atom favicon retired),
  a shared `.eyebrow` recipe family, hue-free `--phase-0..7` tokens, and
  `--color-smoke` renamed to `--color-abyss` (#03110D). `conventions.md` was
  rewritten to match — the README header regenerates from it.
- The bundle in `ds-bundle/` is stale (olive era) until the driver re-runs:
  rebuild `web`, restage `ds-styles.css` + media per the section above, then
  resync + upload per `.ds-sync/storybook/SKILL.md` section 6. The remote
  project also still holds olive-era handoff HTML OUTSIDE sync scope
  (`design_handoff_*/`, uploads/) — replace those by hand.
- The font-var lift block: Sora now loads 300/400 only (the 500 slice was
  dropped from `layout.tsx` per the display-weight rule), so expect the media
  set to change filenames — diff remote fonts for orphans per the gotcha above.
- DONE 2026-08-24: bundle regenerated and uploaded (17 components, 22 font
  orphans deleted — the 20 dead KaTeX faces plus the two Sora-500 slices the
  display-weight rule retired). Verified after-dark in the uploaded CSS: gold
  #c2a379 present, retired olive #8d9b51 absent. The jade imagery was pushed
  to the COMMISSIONED project (see the two-projects note below), not here.

## TWO projects share the name "Quantum Learner Design System"

`config.json`'s `projectId` (`eefe2a41-…`) is the MACHINE-SYNC target: the flat
17-component bundle this driver produces. The commissioned design system the
product was themed from is a DIFFERENT project (`ed6de090-…`) — it carries
`tokens/`, `guidelines/`, `assets/imagery/`, `ui_kits/web/`, `SKILL.md`, and
hand-authored `components/brand/`. Never point the driver at it: a resync would
overwrite hand-authored work with generated output. Imagery and other
hand-maintained assets go there by targeted `finalize_plan` + `write_files`,
as done on 2026-08-24.

## Machine-state traps hit on 2026-08-24 (fix before the next resync)

- `.ds-sync/pkg/node_modules` was a symlink to `…/altivum-dev/quantum/…`, a
  path from a previous machine layout. Repoint it at the current checkout or
  the driver dies with "--node-modules … does not exist".
- **The tsconfig-paths plugin cannot resolve a bare directory import.**
  `.ds-sync/lib/bundle.mjs` probes extensions starting with `''` using
  `existsSync`, which is TRUE for a directory — so `@/*` resolves `@/i18n` to
  the DIRECTORY and esbuild dies with `Cannot read file "web/src/i18n": is a
  directory`. It matches rules in KEY ORDER, not by specificity, so an exact
  `"@/i18n"` rule only wins when it is listed BEFORE `"@/*"`. That ordering is
  now in `.ds-sync/tsconfig.json` — but `.ds-sync/` is gitignored, so a fresh
  clone must redo it. The real fix is upstream: the plugin should skip a
  directory hit (statSync().isFile()) before accepting the empty extension.
  This was NOT new breakage — `@/i18n` entered the components on 2026-07-24,
  six days after the last successful sync, so the first regen since then hit it.

- The remote project's `assets/imagery/*.webp` were the TEAL-graded
  originals (verified 2026-08-24 against the product's jade regrades), even
  though its own brand-imagery guideline says "cool greens". Restage them
  from `web/public/welcome/` at re-sync so the guideline card stops
  contradicting its specimens. DONE 2026-08-24 — the three jade regrades were
  written to `ed6de090-…`'s `assets/imagery/`.
