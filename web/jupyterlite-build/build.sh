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
CLOSURE_WHEELS=$(python - "$PYODIDE_DEST/pyodide-lock.json" <<'PYCLOSURE'
import json, sys
lock = json.load(open(sys.argv[1]))
pkgs = lock["packages"]
norm = lambda s: s.lower().replace("_", "-")
by_norm = {norm(k): v for k, v in pkgs.items()}
seen, stack = set(), ["micropip", "numpy"]
while stack:
    name = norm(stack.pop())
    if name in seen or name not in by_norm:
        continue
    seen.add(name)
    stack.extend(by_norm[name].get("depends", []))
print("\n".join(sorted(by_norm[n]["file_name"] for n in seen)))
PYCLOSURE
)
test -n "$CLOSURE_WHEELS" || { echo "could not compute Pyodide dependency closure from lock"; exit 1; }
for whl in $CLOSURE_WHEELS; do
  echo "    fetching closure wheel $whl"
  curl -fsSL --retry 3 "${PYODIDE_CDN}/${whl}" -o "$PYODIDE_DEST/$whl"
  test -s "$PYODIDE_DEST/$whl" || { echo "closure wheel $whl missing/empty after fetch"; exit 1; }
done

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
# Closure is depends-transitive AND augmented with any lock package that shares an
# import name with a closure package — Pyodide's loadPackagesFromImports loads ALL
# packages providing an imported name, which is how `import numpy` also pulls
# numpy-tests (it declares imports: ['numpy']). A build-time coverage check below
# fails the build if a runnable notebook imports a lock package these roots miss —
# the e2e's third-party-request assertion can't see that (such a wheel would 404
# SAME-ORIGIN, since the kernel loads it via loadPackage from ./static/pyodide/).
LAB_CLOSURE_WHEELS=$(python - "$LAB_PYO_DEST/pyodide-lock.json" <<'PYLAB'
import json, sys
lock = json.load(open(sys.argv[1]))
pkgs = lock["packages"]
norm = lambda s: s.lower().replace("_", "-")
by = {norm(k): v for k, v in pkgs.items()}
roots = ["micropip", "sqlite3", "jedi", "ipython", "numpy", "matplotlib"]
seen, stack = set(), list(roots)
while stack:
    n = norm(stack.pop())
    if n in seen or n not in by:
        continue
    seen.add(n)
    stack.extend(by[n].get("depends", []))
imports_in_closure = {imp for n in seen for imp in by[n].get("imports", [])}
for n, v in by.items():
    if n not in seen and any(imp in imports_in_closure for imp in v.get("imports", [])):
        seen.add(n)
print("\n".join(sorted(by[n]["file_name"] for n in seen)))
PYLAB
)
test -n "$LAB_CLOSURE_WHEELS" || { echo "could not compute lab Pyodide closure from lock"; exit 1; }
for whl in $LAB_CLOSURE_WHEELS; do
  echo "    fetching lab closure wheel $whl"
  curl -fsSL --retry 3 "${LAB_PYO_CDN}/${whl}" -o "$LAB_PYO_DEST/$whl"
  test -s "$LAB_PYO_DEST/$whl" || { echo "lab closure wheel $whl missing/empty after fetch"; exit 1; }
done

# 1d) Coverage check: assert every Pyodide-lock package imported by ANY browser-
#     runnable notebook (per the content manifest) is in the closure we just staged.
#     A lock package the closure misses would 404 SAME-ORIGIN at runtime (the kernel
#     loads it via loadPackage from ./static/pyodide/, not via piplite, so
#     disablePyPIFallback doesn't redirect it and the e2e third-party-request guard
#     can't see it). Failing here, loudly, is the real guard against a future notebook
#     adding e.g. `import scipy` without extending the closure roots above. Imports
#     not in the lock (stdlib, braket->qcsim, lib, the optional ipywidgets) are skipped.
echo "==> Verifying the lab closure covers every runnable notebook's imports"
python - "$LAB_PYO_DEST" <<'PYCOVER'
import json, sys, re, glob, os
dest = sys.argv[1]
pkgs = json.load(open(os.path.join(dest, "pyodide-lock.json")))["packages"]
norm = lambda s: s.lower().replace("_", "-")
provider = {}                       # import name -> lock package(s) providing it
for k, v in pkgs.items():
    for imp in v.get("imports", []):
        provider.setdefault(imp, []).append(norm(k))
present_files = {os.path.basename(p) for p in glob.glob(os.path.join(dest, "*.whl"))}
present = {norm(k) for k, v in pkgs.items() if v["file_name"] in present_files}
manifest = json.load(open("../src/lib/content-manifest.json"))
imp_re = re.compile(r"^\s*(?:import\s+([a-zA-Z0-9_]+)|from\s+([a-zA-Z0-9_]+)\s+import)")
missing, checked = set(), 0
for s in manifest["sections"]:
    for nb in s.get("notebooks", []):
        if not nb.get("runnable"):
            continue
        path = os.path.join("..", "..", s["dirName"], "notebooks", nb["filename"])
        if not os.path.exists(path):
            continue
        checked += 1
        for cell in json.load(open(path)).get("cells", []):
            if cell.get("cell_type") != "code":
                continue
            src = cell.get("source", "")
            src = "".join(src) if isinstance(src, list) else src
            for line in src.splitlines():
                m = imp_re.match(line)
                name = m and (m.group(1) or m.group(2))
                if name in provider and not any(p in present for p in provider[name]):
                    missing.add((s["dirName"] + "/" + nb["filename"], name, tuple(provider[name])))
if missing:
    print("  ERROR: runnable notebooks import Pyodide-lock packages NOT in the closure:", file=sys.stderr)
    for nb, name, provs in sorted(missing):
        print(f"    {nb}: import {name} -> needs {list(provs)}", file=sys.stderr)
    print("  Add the package to the closure roots (the PYLAB block above).", file=sys.stderr)
    sys.exit(1)
print(f"  OK: {checked} runnable notebooks; every lock-resolved import is in the closure")
PYCOVER

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
#     Generated via python (not a heredoc) so the regex escaping is correct and the
#     output is deterministic; the committed jupyter_lite_config.json carries this
#     verbatim and build-smoke asserts they match (self-heals on a version bump).
WHEEL_NAME=$(basename "$QCSIM_DIR"/dist/qcsim-*.whl)
COMM_WHEEL_NAME=$(basename files/wheels/comm-*.whl)
echo "==> Pinning lab kernel (PipliteAddon) to $WHEEL_NAME + $COMM_WHEEL_NAME; un-ignoring lib/"
python - "$WHEEL_NAME" "$COMM_WHEEL_NAME" > jupyter_lite_config.json <<'PY'
import json, sys
config = {
    "LiteBuildConfig": {
        "output_dir": "../public/lab",
        "contents": ["files"],
        # Curated subset of jupyterlite-core's default ignore_contents (see
        # config.py _default_ignore_files): "/lib/" removed so the curriculum lib/
        # package is served to the kernel, "/__pycache__/" added; the dynamic
        # output_dir + jupyter-lite config-filename entries are omitted (none appear
        # under files/). Re-check _default_ignore_files on a jupyterlite-core bump.
        "ignore_contents": [
            r"/_build/", r"/\.cache/", r"/\.env", r"/\.git", r"/\.ipynb_checkpoints",
            r"/build/", r"/dist/", r"/envs/", r"/node_modules/", r"/__pycache__/",
            r"/overrides\.json", r"/untitled\..*", r"/Untitled\..*",
            r"/workspaces/", r"/venvs/", r"\.*doit\.db$", r"\.pyc$",
        ],
    },
    # qcsim (braket.* shim) + comm (the lab kernel's hard boot dependency, otherwise
    # fetched from pypi.org) bundled same-origin into the generated piplite index.
    "PipliteAddon": {
        "piplite_urls": [f"files/wheels/{sys.argv[1]}", f"files/wheels/{sys.argv[2]}"]
    },
}
print(json.dumps(config, indent=2))
PY

# 3) Stage curriculum notebooks into files/<section>/notebooks/.
#    Section list is read from the content manifest (the single source of truth)
#    so this loop can never drift from sections.ts / the curriculum on disk.
echo "==> Staging notebooks"
SECTIONS=$(python3 -c "import json; print('\n'.join(s['dirName'] for s in json.load(open('../src/lib/content-manifest.json'))['sections']))")
for section in $SECTIONS; do
  mkdir -p "files/$section/notebooks"
  cp ../../$section/notebooks/*.ipynb "files/$section/notebooks/" 2>/dev/null || true
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
echo "==> Locking LAB kernel to same-origin (verify pyodideUrl + set disablePyPIFallback)"
python - <<'PYLOCK'
import json, sys
from pathlib import Path

PLUGIN = "@jupyterlite/pyodide-kernel-extension:kernel"
out = Path("../public/lab")
found = 0
for cfg in sorted(out.rglob("jupyter-lite.json")):
    data = json.loads(cfg.read_text())
    settings = data.get("jupyter-config-data", data)
    ks = settings.get("litePluginSettings", {}).get(PLUGIN)
    if not isinstance(ks, dict):
        continue
    url = ks.get("pyodideUrl", "")
    if "jsdelivr" not in url and url.startswith("./") and "pyodide.js" in url:
        found += 1
    else:
        sys.exit(f"  ERROR: {cfg} pyodideUrl is not same-origin: {url!r}")
    if ks.get("disablePyPIFallback") is not True:
        ks["disablePyPIFallback"] = True
        cfg.write_text(json.dumps(data, indent=1) + "\n")
    print(f"  {cfg.relative_to(out)}: pyodideUrl={url} disablePyPIFallback=True")
if not found:
    sys.exit("  ERROR: no emitted jupyter-lite.json carried the pyodide kernel "
             "settings — the self-hosted Pyodide was not wired in")
print(f"  locked {found} lab config(s) to same-origin")
PYLOCK

# 7) Copy items JupyterLite's content service does not auto-serve:
#    - lib/ (Python module tree the notebooks import)
# wheels/ and startup.py are picked up automatically; the qcsim wheel is bundled
# into the piplite index by PipliteAddon (step 2b), so no overrides.json copy.
echo "==> Copying auxiliary files into lab output"
cp -R files/lib ../public/lab/files/lib

# 8) Strip JupyterLite source maps from the production payload. They are ~45MB
#    of the ~65MB output and are only fetched when devtools is open, so deleting
#    them cuts the deployed lab to ~20MB with zero functional impact.
echo "==> Stripping source maps from lab output (production payload)"
find ../public/lab -name '*.map' -type f -delete

echo ""
echo "==> Build complete: ../public/lab/"
ls -la ../public/lab/ | head -10
