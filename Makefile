.PHONY: setup lab test devices cost lint deploy-infra teardown-infra lock-container

setup:
	@echo "Installing dependencies..."
	pip install -e ".[dev]"
	@echo "Validating AWS credentials..."
	@bash infra/scripts/validate-setup.sh

lab:
	jupyter lab --notebook-dir=.

test:
	pytest tests/ -v

devices:
	python -c "\
	from braket.aws import AwsDevice; \
	devices = AwsDevice.get_devices(); \
	print(f'{'Device':<40} {'Status':<12} {'Provider':<15} {'Qubits'}'); \
	print('-' * 80); \
	[print(f'{d.name:<40} {d.status:<12} {d.provider_name:<15} {getattr(d.properties, \"qubitCount\", \"N/A\")}') for d in devices]"

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
	pip-compile 05-hybrid-jobs/containers/requirements.in \
		--output-file=05-hybrid-jobs/containers/requirements.lock \
		--strip-extras --allow-unsafe
