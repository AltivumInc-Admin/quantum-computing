.PHONY: setup git-filters lab test devices cost lint stripe-parity drift design-sync deploy-infra teardown-infra lock-container

setup:
	@echo "Installing dependencies..."
	pip install -e ".[dev]"
	@echo "Installing qcsim (separate package; required by parity + notebook-contract tests)..."
	pip install -e ./qcsim
	@echo "Validating AWS credentials..."
	@bash infra/scripts/validate-setup.sh
	@$(MAKE) --no-print-directory git-filters

# Point git's notebook filters at the in-repo wrapper, which resolves an
# interpreter at run time. Deliberately NOT `nbstripout --install`: that writes
# the absolute path of the current python into the unversioned .git/config, so
# it goes stale whenever the repo moves, .venv is recreated, or setup is run
# from another checkout's venv — and with required=true a dead clean filter
# blocks notebook commits, not just diffs. Re-runnable; safe to run any time.
git-filters:
	@echo "Wiring nbstripout git filters (path-independent)..."
	@git config filter.nbstripout.clean "scripts/git/nbstripout-filter.sh"
	@git config filter.nbstripout.smudge cat
	@git config filter.nbstripout.required true
	@git config diff.ipynb.textconv "scripts/git/nbstripout-filter.sh -t"
	@echo "  clean/textconv -> scripts/git/nbstripout-filter.sh"

lab:
	jupyter lab --notebook-dir=.

test:
	pytest tests/ -v

devices:
	python 02-hardware/scripts/device_status.py

cost:
	python infra/scripts/cost-report.py

lint:
	ruff check .
	ruff format --check .

KEYREF ?= op://Quantum Learner/Stripe/add more/Secret Key

stripe-parity:
	@# Does the Stripe Dashboard match the code? Two things no test in this repo
	@# can see, because the Dashboard is not in the repo. Read-only; needs a key.
	@#   make stripe-parity ACCOUNT=acct_1TuFow07hJdXv6GV      (live)
	@#   make stripe-parity ACCOUNT=acct_1TuFpH0a2DloOdGu KEYREF="op://Quantum Learner/Stripe Sandbox/Secret Key"
	@test -n "$(ACCOUNT)" || { echo "ACCOUNT=acct_... is required"; exit 2; }
	@STRIPE_API_KEY="$$(op read '$(KEYREF)')" node scripts/stripe/check-webhook-parity.mjs --expect-account $(ACCOUNT)
	@STRIPE_API_KEY="$$(op read '$(KEYREF)')" node scripts/stripe/check-catalog-parity.mjs --expect-account $(ACCOUNT)

drift:
	@# Is what is RUNNING what is in git? Merging is not shipping, and a green CI plus a
	@# closed PR plus an UPDATE_COMPLETE stack can all be true while production runs
	@# week-old code. And is the DEPLOYED CONFIGURATION consistent? Code parity says
	@# nothing about the rate factor the two pricing functions carry (rule 5); the
	@# second check compares them value-blind (no value, no digest — rule 6).
	@# Both ALWAYS run — code drift is the normal state mid-cutover, and stopping there
	@# would leave rate parity unchecked in exactly the window it matters most.
	@code=0; node scripts/check-lambda-drift.mjs || code=$$?; \
	 node scripts/check-rate-parity.mjs || code=$$?; \
	 exit $$code

design-sync:
	@# Before any design-sync driver run. Two claude.ai projects are named
	@# "Quantum Learner Design System"; a run against the hand-authored one
	@# replaces it with generated output and deletes what it cannot regenerate.
	@# Preflight answers "which one does config.json point at", restage rebuilds
	@# the gitignored .ds-sync/ state a fresh clone cannot inherit.
	@# Order matters, and unlike `drift` a red preflight must STOP the run: make
	@# aborts on the first failing recipe line, which is exactly right here —
	@# there is nothing to gain from staging a build aimed at the wrong project.
	@# Preflight red = the TARGET is wrong (stop and read .design-sync/NOTES.md).
	@# Restage red = a PREREQUISITE is unstaged (npm ci in web/, or the skill's
	@# `cp -r`); the message names which. Both are read-only about the remote.
	node scripts/design-sync/preflight.mjs
	node scripts/design-sync/restage.mjs

deploy-infra:
	bash infra/scripts/deploy-infra.sh

teardown-infra:
	bash infra/scripts/teardown-infra.sh

lock-container:
	pip-compile 06-hybrid-jobs/containers/requirements.in \
		--output-file=06-hybrid-jobs/containers/requirements.lock \
		--strip-extras --allow-unsafe
