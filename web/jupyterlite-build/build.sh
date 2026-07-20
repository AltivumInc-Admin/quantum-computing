#!/usr/bin/env bash
# Builds the in-browser JupyterLite distribution that powers the
# "Run in Browser" action on every browser-runnable notebook.
#
# Outputs to ../public/lab/, which Next.js then ships as static files.

set -euo pipefail
cd "$(dirname "$0")"

# 1) Build venv if missing, install build deps.
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# CloudFront compresses a response only when the object is UNDER 10,000,000
# bytes (its documented maximum file size for compression); anything at or over
# that ceiling is served RAW. For a multi-MB wasm that is the difference between
# ~2.8 MB brotli on the wire and the full uncompressed payload on EVERY cold
# boot: the lesson runtime's 0.27.7 pyodide.asm.wasm was 10,105,545 bytes --
# 105,545 bytes over -- and shipped as 10.1 MB raw (live-verified on
# quantum.altivum.ai) while the lab's 8,647,609-byte copy compressed to ~2.8 MB.
# Assert EVERY staged wasm stays under the ceiling so no future Pyodide (or
# other wasm) bump can silently fall off the compression cliff.
WASM_COMPRESSION_CEILING=10000000
assert_wasm_under_ceiling() {
  local dir="$1"
  local f size count=0 ok=1
  while IFS= read -r -d '' f; do
    count=$((count + 1))
    size=$(wc -c < "$f" | tr -d '[:space:]')
    if [ "$size" -lt "$WASM_COMPRESSION_CEILING" ]; then
      echo "    OK: $f = $size bytes (< $WASM_COMPRESSION_CEILING)"
    else
      echo "    ERROR: $f = $size bytes, at/over CloudFront's $WASM_COMPRESSION_CEILING-byte compression ceiling." >&2
      echo "           CloudFront will serve it UNCOMPRESSED (no brotli/gzip) -- megabytes of pure waste per cold boot." >&2
      echo "           Use a Pyodide build (or asset) whose wasm stays under the ceiling." >&2
      ok=0
    fi
  done < <(find "$dir" -type f -name '*.wasm' -print0)
  # Zero wasm found means the runtime was not staged at all -- fail loudly
  # rather than let the guard pass vacuously.
  if [ "$count" -eq 0 ]; then
    echo "    ERROR: no .wasm found under $dir (expected the Pyodide runtime wasm)" >&2
    exit 1
  fi
  [ "$ok" -eq 1 ] || exit 1
}

# Download (and cache) a pyodide-core release tarball, then unpack it into $2.
# The tarball is keyed by version under .cache/ (already persisted across builds
# by both CI and Amplify), so the two runtime stagings below share one download
# when their pins coincide — which they do today: the LESSON runtime is pinned
# to the same Pyodide build the LAB kernel uses (0.29.0), whose pyodide.asm.wasm
# stays under CloudFront's compression ceiling (see the wasm assertion below).
fetch_pyodide_core() {
  local version="$1" dest="$2"
  local tarball=".cache/pyodide-core-${version}.tar.bz2"
  mkdir -p .cache
  if [[ -s "$tarball" ]]; then
    echo "    using cached ${tarball}"
  else
    curl -fsSL --retry 3 \
      "https://github.com/pyodide/pyodide/releases/download/${version}/pyodide-core-${version}.tar.bz2" \
      -o "${tarball}.part"
    mv "${tarball}.part" "$tarball"
  fi
  local tmp
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/pyodide-core-XXXXXX")
  # A corrupt cached tarball must not wedge every future build: drop it on failure.
  tar -xjf "$tarball" -C "$tmp" \
    || { rm -f "$tarball"; rm -rf "$tmp"; echo "corrupt ${tarball} removed - rerun the build"; exit 1; }
  cp -R "$tmp"/pyodide/. "$dest"/   # tarball unpacks to pyodide/
  rm -rf "$tmp"
}

# Fetch a computed wheel closure into a staged distribution. Both the lesson
# runtime and the lab kernel need this (the "core" tarball ships no wheels), so
# it is a helper for the same reason fetch_pyodide_core above is one.
# Usage: fetch_closure_wheels <cdn-base> <dest> <label> <newline-separated wheels>
fetch_closure_wheels() {
  local cdn="$1" dest="$2" label="$3" wheels="$4" whl
  for whl in $wheels; do
    echo "    fetching ${label}closure wheel $whl"
    curl -fsSL --retry 3 "${cdn}/${whl}" -o "$dest/$whl"
    test -s "$dest/$whl" || { echo "${label}closure wheel $whl missing/empty after fetch"; exit 1; }
  done
}

# 1b) Self-host the pinned Pyodide LESSON runtime under ../public/pyodide so
#     src/lib/pyodide-runtime.ts boots from SAME-ORIGIN instead of a third-party
#     CDN, removing the runtime single point of failure. The version is parsed
#     from the runtime file so the self-host and the runtime can never drift.
#
#     The "core" distribution ships pyodide.js + wasm + stdlib + the package
#     lockfile but NO package wheels — and the runtime needs micropip (to install
#     the qcsim wheel) plus numpy (qcsim's dependency). So after unpacking core we
#     also fetch exactly the lockfile dependency closure of {micropip, numpy}
#     (micropip, numpy, packaging) into the same dir, which is where Pyodide
#     resolves packages from indexURL. Computed from the lock so a Pyodide bump
#     stays correct. (This is a BUILD-time CDN fetch; the goal is to remove the
#     RUNTIME CDN dependency, and `set -euo pipefail` aborts on any fetch failure
#     so a partial self-host can never ship.)
PYODIDE_VERSION=$(grep -oE 'PYODIDE_VERSION *= *"[0-9.]+"' ../src/lib/pyodide-runtime.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
test -n "$PYODIDE_VERSION" || { echo "could not parse PYODIDE_VERSION from pyodide-runtime.ts"; exit 1; }
PYODIDE_DEST="../public/pyodide"
PYODIDE_CDN="https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full"
echo "==> Self-hosting Pyodide ${PYODIDE_VERSION} runtime -> ${PYODIDE_DEST}"
rm -rf "$PYODIDE_DEST"
mkdir -p "$PYODIDE_DEST"
fetch_pyodide_core "$PYODIDE_VERSION" "$PYODIDE_DEST"
test -f "$PYODIDE_DEST/pyodide.js" || { echo "pyodide.js missing after self-host"; exit 1; }
# Fetch the {micropip, numpy} closure (the wheels 'core' omits) so the runtime's
# loadPackage('micropip') + micropip.install(qcsim -> numpy) all resolve same-origin.
CLOSURE_WHEELS=$(python pyodide_closure.py "$PYODIDE_DEST/pyodide-lock.json" micropip numpy)
test -n "$CLOSURE_WHEELS" || { echo "could not compute Pyodide dependency closure from lock"; exit 1; }
fetch_closure_wheels "$PYODIDE_CDN" "$PYODIDE_DEST" "" "$CLOSURE_WHEELS"

# 1c) Self-host the in-browser LAB kernel's Pyodide distribution under
#     jupyterlite-build/static/pyodide/ — PyodideAddon's "well-known" path, which
#     `jupyter lite build` auto-detects: it copies the dir into the lab output at
#     static/pyodide/ and rewrites the kernel's `pyodideUrl` to the same-origin
#     ./static/pyodide/pyodide.js. Without this the JupyterLite kernel boots Pyodide
#     from cdn.jsdelivr.net on every "Run in Browser", so a blocked/owned/down CDN
#     bricks the whole lab.
#
#     This is a SEPARATELY-STAGED Pyodide from the lesson runtime above: its version
#     is the KERNEL package's own pin (read from jupyterlite-pyodide-kernel so a
#     kernel bump self-heals), sourced independently from the lesson runtime's pin
#     (they coincide at 0.29.0 today, so the core tarball downloads once via the
#     cache, but either pin can move alone), so the two must not share a directory.
#     As with the lesson runtime, "core" ships no wheels, so after
#     unpacking core we fetch the exact wheel closure the lab loads (computed from the
#     lock; see below).
LAB_PYODIDE_VERSION=$(python -c 'from jupyterlite_pyodide_kernel.constants import PYODIDE_VERSION; print(PYODIDE_VERSION)')
test -n "$LAB_PYODIDE_VERSION" || { echo "could not read kernel PYODIDE_VERSION"; exit 1; }
LAB_PYO_DEST="static/pyodide"   # relative to lite_dir (here); PyodideAddon well-known path
LAB_PYO_CDN="https://cdn.jsdelivr.net/pyodide/v${LAB_PYODIDE_VERSION}/full"
echo "==> Self-hosting LAB kernel Pyodide ${LAB_PYODIDE_VERSION} -> ${LAB_PYO_DEST}"
rm -rf "$LAB_PYO_DEST"
mkdir -p "$LAB_PYO_DEST"
fetch_pyodide_core "$LAB_PYODIDE_VERSION" "$LAB_PYO_DEST"
test -f "$LAB_PYO_DEST/pyodide.js" || { echo "lab pyodide.js missing after self-host"; exit 1; }
# Compute the exact wheel closure the lab loads from the lock. Roots:
#   - kernel boot packages that resolve via the Pyodide lock: sqlite3, jedi, ipython
#     (from the kernel's initKernel list ["sqlite3","ipykernel","comm","pyodide_kernel",
#     "jedi","ipython"]; ipykernel/pyodide_kernel come from the bundled same-origin
#     piplite index, comm is bundled in step 2a below);
#   - micropip (always loadPackage'd to bootstrap piplite);
#   - the curriculum notebooks' non-stdlib imports: numpy + matplotlib.
# The closure is exactly depends-transitive. It used to ALSO pull in any lock
# package sharing an import name with a closure package, on the belief that
# loadPackagesFromImports loads every provider of an imported name — it does not.
# Pyodide indexes imports into a Map, one package per name, last writer wins, so
# that pass only ever added `numpy-tests` (a 1.6 MB wheel of numpy's test suite,
# which also SHADOWED the real numpy for `import numpy`). prune_lock.py below
# removes such shadowing entries from the staged lock and asserts the invariant.
# A build-time coverage check (step 1d) fails the build if a runnable notebook
# imports a lock package these roots miss — the e2e's third-party-request
# assertion can't see that (such a wheel would 404 SAME-ORIGIN, since the kernel
# loads it via loadPackage from ./static/pyodide/).
LAB_CLOSURE_ROOTS="micropip sqlite3 jedi ipython numpy matplotlib"
# shellcheck disable=SC2086  # deliberate word-splitting: roots are one arg each
LAB_CLOSURE_WHEELS=$(python pyodide_closure.py "$LAB_PYO_DEST/pyodide-lock.json" $LAB_CLOSURE_ROOTS)
test -n "$LAB_CLOSURE_WHEELS" || { echo "could not compute lab Pyodide closure from lock"; exit 1; }
fetch_closure_wheels "$LAB_PYO_CDN" "$LAB_PYO_DEST" "lab " "$LAB_CLOSURE_WHEELS"

# Drop upstream's test-suite sibling packages from the STAGED lock. They ship no
# importable module, weigh megabytes, and — because they declare the SAME imports
# as the real package while sitting after it in the lock — win the import name
# outright. See prune_lock.py for the full mechanism; it also asserts that no
# import name a staged package provides resolves to a package we did not stage.
echo "==> Pruning shadowing test-suite packages from the staged lab lock"
python prune_lock.py "$LAB_PYO_DEST"

# 1d) Coverage check: assert every Pyodide-lock package imported by ANY browser-
#     runnable notebook (per the content manifest) is in the closure we just staged.
#     A lock package the closure misses would 404 SAME-ORIGIN at runtime (the kernel
#     loads it via loadPackage from ./static/pyodide/, not via piplite, so
#     disablePyPIFallback doesn't redirect it and the e2e third-party-request guard
#     can't see it). Failing here, loudly, is the real guard against a future notebook
#     adding e.g. `import scipy` without extending the closure roots above. Imports
#     not in the lock (stdlib, braket->qcsim, lib, the optional ipywidgets) are skipped.
#     Lives in check_notebook_coverage.py so ruff lints it and tests/ can exercise it
#     (tests/test_lab_build_guards.py) — a guard nothing verified is no guard.
echo "==> Verifying the lab closure covers every runnable notebook's imports"
python check_notebook_coverage.py "$LAB_PYO_DEST"

# 2) Build the qcsim wheel and stash it under files/wheels/.
QCSIM_DIR="../../qcsim"
echo "==> Building qcsim wheel"
(
  cd "$QCSIM_DIR"
  rm -rf dist
  python -m build --wheel --outdir dist
)
mkdir -p files/wheels
# Clear any wheel from a previous (e.g. pre-version-bump) build so an incremental
# local run never stages two qcsim wheels — only the freshly built one ships.
rm -f files/wheels/qcsim-*.whl
cp "$QCSIM_DIR"/dist/qcsim-*.whl files/wheels/

# 2a) Bundle the `comm` wheel into the SAME-ORIGIN piplite index. The lab kernel's
#     boot sequence hard-installs comm BEFORE `import pyodide_kernel` (pyodide_kernel
#     does a top-level `import comm`, so the kernel fails to boot without it), and
#     comm is in neither the Pyodide lock nor the kernel's bundled index — so today
#     it is fetched from pypi.org on EVERY kernel start: a second runtime SPOF where
#     PyPI being down/blocked breaks the entire lab kernel, not just widgets. Pin and
#     bundle it locally; combined with disablePyPIFallback (set on the built config in
#     step 6b) the lab kernel boots fully same-origin. comm is pure-python with NO
#     runtime dependencies (its wheel declares only a pytest test-extra), so it installs
#     same-origin with nothing left to resolve under the disabled PyPI fallback.
COMM_VERSION="0.2.3"
echo "==> Bundling comm==${COMM_VERSION} into the local piplite index"
rm -f files/wheels/comm-*.whl
pip download --quiet --no-deps --only-binary=:all: "comm==${COMM_VERSION}" --dest files/wheels
ls files/wheels/comm-"${COMM_VERSION}"-*.whl >/dev/null 2>&1 \
  || { echo "comm==${COMM_VERSION} wheel not downloaded"; exit 1; }

# 2b) Generate jupyter_lite_config.json. Two things it must wire up:
#     - PipliteAddon.piplite_urls: pin the kernel to the ACTUAL built wheel so a
#       qcsim version bump can never desync the pin. `jupyter lite build` bundles
#       the wheel into the generated piplite index, so the notebook bootstrap's
#       `piplite.install("qcsim")` resolves it offline. (A settings overrides.json
#       is NOT applied by the build, so it can't wire pipliteUrls; PipliteAddon is
#       the mechanism that works.)
#     - ignore_contents: jupyterlite-core's DEFAULT ignore list skips any path
#       containing "/lib/" (it assumes a build/env dir), which silently drops the
#       curriculum's shared lib/ package from the in-browser contents -> every
#       `from lib import ...` cell fails with ModuleNotFoundError. We override it
#       with a curated subset of that default — "/lib/" REMOVED (so lib is indexed
#       and importable) and "/__pycache__/" added — omitting the dynamic output_dir
#       and jupyter-lite config-filename entries, which never appear under files/.
#     Generated by write_lite_config.py (not hand-maintained) so the regex escaping
#     is correct and the output is deterministic; the committed
#     jupyter_lite_config.json carries this verbatim and build-smoke asserts they
#     match (self-heals on a version bump).
WHEEL_NAME=$(basename "$QCSIM_DIR"/dist/qcsim-*.whl)
COMM_WHEEL_NAME=$(basename files/wheels/comm-*.whl)
echo "==> Pinning lab kernel (PipliteAddon) to $WHEEL_NAME + $COMM_WHEEL_NAME; un-ignoring lib/"
python write_lite_config.py "$WHEEL_NAME" "$COMM_WHEEL_NAME" > jupyter_lite_config.json

# 3) Stage curriculum notebooks into files/<section>/notebooks/.
#    Section list is read from the content manifest (the single source of truth)
#    so this loop can never drift from sections.ts / the curriculum on disk.
#    Clear-then-copy, like every other staging step in this file: files/<section>/
#    is a gitignored local artifact, so without the rm a renamed or deleted
#    notebook keeps its stale staged copy, gets a bootstrap injected by
#    prepare_notebooks.py (which rglobs whatever is present) and ships into the
#    lab a developer is verifying against. Copy failures are NOT suppressed —
#    every section has notebooks, so a failing glob is a real error, and hiding it
#    would just produce a quieter, emptier lab.
echo "==> Staging notebooks"
SECTIONS=$(python3 -c "import json; print('\n'.join(s['dirName'] for s in json.load(open('../src/lib/content-manifest.json'))['sections']))")
for section in $SECTIONS; do
  rm -rf "files/$section/notebooks"
  mkdir -p "files/$section/notebooks"
  cp ../../"$section"/notebooks/*.ipynb "files/$section/notebooks/"
done

# 4) Stage the curriculum's shared lib/ verbatim.
echo "==> Staging lib/"
rm -rf files/lib
cp -R ../../lib files/lib
# Strip Python caches that may have been copied in.
find files/lib -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true

# 5) Inject a Pyodide bootstrap cell into every notebook so qcsim is set
#    up before the notebook's `from braket.circuits import Circuit` runs.
echo "==> Injecting Pyodide bootstrap cells"
python prepare_notebooks.py

# 6) Build the JupyterLite distribution.
echo "==> jupyter lite build"
jupyter lite build

# 6b) Lock the LAB kernel to same-origin. PyodideAddon (driven by the well-known
#     static/pyodide staged in step 1c) should have rewritten the kernel's pyodideUrl
#     to ./static/pyodide/pyodide.js; ASSERT that (no jsdelivr left), then set
#     disablePyPIFallback so piplite never reaches pypi.org — comm and every boot
#     package now resolve from the same-origin index/distribution. Patch every emitted
#     jupyter-lite.json that carries the kernel plugin settings. Fails the build if no
#     config carries those settings (would mean the self-host silently didn't apply).
#     Also brands the output: the lab shipped as an unidentifiable "JupyterLite"
#     tab painting white before boot, while the site's own default theme is dark.
#     finalize_lab.py sets appName/faviconUrl on every emitted config, stages the
#     site favicon, rewrites the pre-boot <title> + body ground in the emitted app
#     HTML, and ASSERTS all of it (plus the overrides.json theme override) so a
#     jupyterlite bump cannot silently revert any of it.
echo "==> Locking LAB kernel to same-origin + branding the lab output"
python finalize_lab.py

# 7) Strip JupyterLite source maps from the production payload. They are ~45MB
#    of the ~65MB output and are only fetched when devtools is open, so deleting
#    them cuts the deployed lab to ~20MB with zero functional impact.
echo "==> Stripping source maps from lab output (production payload)"
find ../public/lab -name '*.map' -type f -delete

# 8) Hard gate: every wasm staged by this build -- the lesson runtime under
#    ../public/pyodide AND the lab kernel's copy inside ../public/lab -- must
#    stay under CloudFront's compression ceiling (see assert_wasm_under_ceiling).
echo "==> Asserting every staged wasm is under CloudFront's compression ceiling"
assert_wasm_under_ceiling "$PYODIDE_DEST"
assert_wasm_under_ceiling ../public/lab

echo ""
echo "==> Build complete: ../public/lab/"
ls -la ../public/lab/ | head -10
