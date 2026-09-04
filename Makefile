.PHONY: setup git-filters lab test devices cost lint stripe-parity drift fleet design-sync deploy-infra teardown-infra lock-container

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

# The endpoint we expect to be receiving our events. Threaded into the webhook
# check so an endpoint NOBODY put there — the one Dashboard change that
# exfiltrates every event payload — is a failure instead of an OK line. This is
# the QL-Prod billing webhook recorded in scripts/migration/README.md. Override
# for a sandbox run, or pass ENDPOINT= (empty) to skip the URL identity check.
ENDPOINT ?= https://00tlxl2jte.execute-api.us-east-2.amazonaws.com/webhook

stripe-parity:
	@# Does the Stripe Dashboard match the code? Two things no test in this repo
	@# can see, because the Dashboard is not in the repo. Read-only; needs a key.
	@#   make stripe-parity ACCOUNT=live
	@#   make stripe-parity ACCOUNT=sandbox KEYREF="op://Quantum Learner/Stripe Sandbox/Secret Key" ENDPOINT=https://axikm3lao9.execute-api.us-east-2.amazonaws.com/webhook
	@# ACCOUNT takes an alias (live/sandbox) resolved through
	@# scripts/stripe/lib/accounts.mjs, or an explicit acct_... An alias cannot go
	@# stale the way the written-down sandbox id did.
	@# Both ALWAYS run, and the exit codes accumulate — same shape as `drift`
	@# below, for the same reason. These scripts exit 1 on ordinary drift, so a
	@# recipe of two separate lines aborts after the first report in exactly the
	@# case the target exists for: on 2026-08-17 the live endpoint was subscribed
	@# to 4 of 9 events AND the product descriptions had drifted, and only the
	@# first would have been shown. One shell also means one 1Password prompt.
	@test -n "$(ACCOUNT)" || { echo "ACCOUNT=acct_... is required"; exit 2; }
	@code=0; export STRIPE_API_KEY="$$(op read '$(KEYREF)')"; \
	 node scripts/stripe/check-webhook-parity.mjs --expect-account $(ACCOUNT) $(if $(ENDPOINT),--expect-url $(ENDPOINT)) || code=$$?; \
	 node scripts/stripe/check-catalog-parity.mjs --expect-account $(ACCOUNT) || code=$$?; \
	 exit $$code

drift:
	@# Is what is RUNNING what is in git? Merging is not shipping, and a green CI plus a
	@# closed PR plus an UPDATE_COMPLETE stack can all be true while production runs
	@# week-old code. And is the DEPLOYED CONFIGURATION consistent? Code parity says
	@# nothing about the rate factor the two pricing functions carry (rule 5); the
	@# second check compares them value-blind (no value, no digest — rule 6).
	@# Both ALWAYS run — code drift is the normal state mid-cutover, and stopping there
	@# would leave rate parity unchecked in exactly the window it matters most.
	@# WHICH ACCOUNT: the default AWS profile on this machine is NOT the one serving
	@# learners, and every function name checked here exists in both. Export
	@# DRIFT_EXPECT_ACCOUNT (it is inherited from your shell — the number stays out of
	@# this public repo) and both checks refuse a mismatch instead of reporting green
	@# about the wrong account. Unset is allowed, and prints as "account unverified".
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

fleet:
	@# Does the fleet this repo TEACHES still exist on Amazon Braket? Every other
	@# device guard reads lib/hardware/devices.py and asserts something against it —
	@# shot bounds, the Lambda's device constants, the web mirror — so a retired
	@# device blesses itself: the row says it is fine and every check reads the row.
	@# This is the only check that asks AWS. It compares BOTH ways: a row the live
	@# fleet contradicts (a dispatch bug — run_circuit prints a cost estimate and
	@# submits to a machine the service will refuse), and an ONLINE device the
	@# curriculum has no row for (the half no test derived from devices.py can
	@# produce). Read-only: braket:SearchDevices in five regions, no task, no spend.
	@# With no credentials it prints SKIPPED and exits 0 rather than failing.
	@# NO account pinning, unlike `drift`: the Braket device catalog is a per-region
	@# SERVICE catalog, identical for every account, so DRIFT_EXPECT_ACCOUNT would
	@# pin nothing here. Runs nightly in .github/workflows/device-fleet.yml.
	@# Exit: 0 current  1 divergent  2 could not check.
	node scripts/check-device-fleet.mjs
