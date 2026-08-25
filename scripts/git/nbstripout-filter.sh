#!/usr/bin/env bash
#
# Run nbstripout for git's notebook filters, resolving the interpreter at RUN
# time instead of baking one into .git/config.
#
# WHY THIS EXISTS. `nbstripout --install` writes the absolute path of whichever
# python happened to be active into .git/config:
#
#     filter.nbstripout.clean = /Users/…/some-other-checkout/.venv/bin/python3 -m nbstripout
#
# .git/config is not versioned and that path is absolute, so the value survives
# exactly as long as that one interpreter does. Run `make setup` from a second
# checkout's venv, move the repo, or recreate .venv, and every notebook
# operation starts failing with:
#
#     …/.venv/bin/python3: No such file or directory
#     fatal: unable to read files to diff
#
# That is not cosmetic. filter.nbstripout.required is true, so a clean filter
# that cannot start blocks notebook COMMITS, not just diffs — and this repo's
# test suite executes every curriculum notebook. It was found broken on
# 2026-08-25 pointing at a checkout that no longer existed.
#
# THE FIX. git runs filters with the working directory set to the repo root, so
# .git/config can hold a REPO-RELATIVE path to this script and never go stale.
# The interpreter is chosen here, per invocation, from whatever is actually
# present now.
#
# Usage (wired by `make git-filters`):
#   filter.nbstripout.clean  = scripts/git/nbstripout-filter.sh
#   diff.ipynb.textconv      = scripts/git/nbstripout-filter.sh -t
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Prefer the repo's own venv, then an active one, then PATH. First hit that can
# actually import nbstripout wins — presence of the binary is not proof.
for py in "$root/.venv/bin/python3" "${VIRTUAL_ENV:-}/bin/python3" python3; do
  [ -n "$py" ] || continue
  command -v "$py" >/dev/null 2>&1 || [ -x "$py" ] || continue
  if "$py" -c 'import nbstripout' >/dev/null 2>&1; then
    exec "$py" -m nbstripout "$@"
  fi
done

# Never silently pass the notebook through unchanged: with required=true that
# would strip nothing and commit outputs. Fail loudly and say the remedy.
echo "nbstripout-filter: no python with nbstripout found (tried $root/.venv, \$VIRTUAL_ENV, PATH)." >&2
echo "                   run \`make setup\`, or \`pip install nbstripout\`." >&2
exit 1
