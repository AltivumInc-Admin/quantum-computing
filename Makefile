.PHONY: setup lab test devices cost lint deploy-infra teardown-infra lock-container

setup:
	@echo "Installing dependencies..."
	pip install -e ".[dev]"
	@echo "Installing qcsim (separate package; required by parity + notebook-contract tests)..."
	pip install -e ./qcsim
	@echo "Validating AWS credentials..."
	@bash infra/scripts/validate-setup.sh
	@echo "Installing nbstripout git filter..."
	@nbstripout --install --attributes .gitattributes

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

deploy-infra:
	bash infra/scripts/deploy-infra.sh

teardown-infra:
	bash infra/scripts/teardown-infra.sh

lock-container:
	pip-compile 06-hybrid-jobs/containers/requirements.in \
		--output-file=06-hybrid-jobs/containers/requirements.lock \
		--strip-extras --allow-unsafe
