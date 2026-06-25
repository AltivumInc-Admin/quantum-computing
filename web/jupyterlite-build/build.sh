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
TMP_PYO=$(mktemp -d "${TMPDIR:-/tmp}/pyodide-core-XXXXXX")
curl -fsSL --retry 3 \
  "https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/pyodide-core-${PYODIDE_VERSION}.tar.bz2" \
  -o "$TMP_PYO/core.tar.bz2"
tar -xjf "$TMP_PYO/core.tar.bz2" -C "$TMP_PYO"   # unpacks to $TMP_PYO/pyodide/
cp -R "$TMP_PYO"/pyodide/. "$PYODIDE_DEST"/
rm -rf "$TMP_PYO"
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
echo "==> Pinning lab kernel (PipliteAddon) to $WHEEL_NAME; un-ignoring lib/"
python - "$WHEEL_NAME" > jupyter_lite_config.json <<'PY'
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
    "PipliteAddon": {"piplite_urls": [f"files/wheels/{sys.argv[1]}"]},
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
