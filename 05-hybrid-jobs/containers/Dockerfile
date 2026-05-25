FROM 292282985366.dkr.ecr.us-east-1.amazonaws.com/amazon-braket-base-jobs:latest

# Install pinned dependencies for reproducible builds
COPY 05-hybrid-jobs/containers/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -r /tmp/requirements.lock && rm /tmp/requirements.lock

# Copy workspace library
COPY lib/ /opt/ml/code/lib/
