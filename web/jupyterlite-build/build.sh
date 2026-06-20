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

# 2) Build the qcsim wheel and stash it under files/wheels/.
QCSIM_DIR="../../qcsim"
echo "==> Building qcsim wheel"
(
  cd "$QCSIM_DIR"
  rm -rf dist
  python -m build --wheel --outdir dist
)
mkdir -p files/wheels
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
