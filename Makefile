.PHONY: setup git-filters lab test devices cost lint stripe-parity drift deploy-infra teardown-infra lock-container

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
	@test -n "$(ACCOUNT)" || { echo "ACCOUNT=acct_... is required"; exit 2; }
	@STRIPE_API_KEY="$$(op read '$(KEYREF)')" node scripts/stripe/check-webhook-parity.mjs --expect-account $(ACCOUNT) $(if $(ENDPOINT),--expect-url $(ENDPOINT))
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

deploy-infra:
	bash infra/scripts/deploy-infra.sh

teardown-infra:
	bash infra/scripts/teardown-infra.sh

lock-container:
	pip-compile 06-hybrid-jobs/containers/requirements.in \
		--output-file=06-hybrid-jobs/containers/requirements.lock \
		--strip-extras --allow-unsafe
