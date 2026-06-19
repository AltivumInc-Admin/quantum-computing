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

# 2b) Pin the in-browser kernel to the ACTUAL built wheel via PipliteAddon, so a
#     qcsim version bump can never desync the pin. `jupyter lite build` reads
#     PipliteAddon.piplite_urls from jupyter_lite_config.json and bundles the wheel
#     into the generated piplite index, so the notebook bootstrap's
#     `piplite.install("qcsim")` resolves it offline. (A settings overrides.json is
#     NOT applied by the build — litePluginSettings stays empty — so it cannot wire
#     pipliteUrls; PipliteAddon is the mechanism that works.) The committed
#     jupyter_lite_config.json carries the current wheel; this regenerates it from
#     the real filename so it self-heals on a version bump.
WHEEL_NAME=$(basename "$QCSIM_DIR"/dist/qcsim-*.whl)
echo "==> Pinning lab kernel (PipliteAddon) to $WHEEL_NAME"
cat > jupyter_lite_config.json <<EOF
{
  "LiteBuildConfig": {
    "output_dir": "../public/lab",
    "contents": ["files"]
  },
  "PipliteAddon": {
    "piplite_urls": ["files/wheels/${WHEEL_NAME}"]
  }
}
EOF

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
