FROM 292282985366.dkr.ecr.us-east-1.amazonaws.com/amazon-braket-base-jobs:latest

# Additional chemistry dependencies
RUN pip install --no-cache-dir \
    openfermion>=1.6 \
    openfermionpyscf>=0.5 \
    pyscf>=2.4 \
    pennylane>=0.38 \
    pennylane-braket>=1.25 \
    scikit-learn>=1.4

# Copy workspace library
COPY lib/ /opt/ml/code/lib/
